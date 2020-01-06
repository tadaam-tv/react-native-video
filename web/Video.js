import React, { Component } from 'react';
import { createElement } from 'react-native';
import { fromByteArray, toByteArray } from 'base64-js';
import shaka from 'shaka-player';
import PropTypes from 'prop-types';
import styles from './Video.styles';

const progressUpdateInterval = 250.0;
const defaultKeyRobustness = 'HW_SECURE_ALL';
const lowestKeyRobustness = 'SW_SECURE_CRYPTO';

class Video extends Component {
  constructor(props) {
    super(props);
    this.videoRef = React.createRef();
    this.state = { drmKeyRobustness: defaultKeyRobustness };
  }

  componentDidMount() {
    // Install built-in polyfills to patch browser incompatibilities.
    shaka.polyfill.installAll();

    // Check to see if the browser supports the basic APIs Shaka needs.
    if (shaka.Player.isBrowserSupported()) {
      const video = this.videoRef.current;

      // create a player
      this.buildPlayer(video);

      // init video
      video.addEventListener('error', this.onErrorEvent);
      video.addEventListener('ended', this.onEnd);
      video.addEventListener('loadeddata', this.onLoad);
      video.addEventListener('canplay', this.onReadyForDisplay);
      video.addEventListener('pause', this.onPause);
    } else {
      // This browser does not have the minimum set of APIs we need.
      console.error('Browser not supported!');
    }
  }

  componentDidUpdate(prevProps) {
    const { paused, source } = this.props;
    const { paused: wasPaused, source: prevSource } = prevProps;

    // check for updated manifest uri
    if (source.uri !== prevSource.uri) {
      this.reloadSource(source);
    }

    // check for play/pause changes
    const video = this.videoRef.current;
    if (video) {
      if (!wasPaused && paused) {
        video.pause();
      }
      if (wasPaused && !paused) {
        this.requestPlay();
      }
    }
  }

  componentWillUnmount() {
    const video = this.videoRef.current;
    if (video) {
      video.removeEventListener('error', this.onErrorEvent);
      video.removeEventListener('ended', this.onEnd);
      video.removeEventListener('loadeddata', this.onLoad);
      video.removeEventListener('canplay', this.onReadyForDisplay);
      video.removeEventListener('pause', this.onPause);
      video.removeEventListener('play', this.onPlay);
    }
    this.stopProgressTimer();

    // destroy player
    this.shutdownPlayer();
  }

  onErrorEvent(event) {
    // Extract the shaka.util.Error object from the event.
    this.onError(event.detail);
  }

  // eslint-disable-next-line class-methods-use-this
  onError(error) {
    // Log the error.
    const { onError } = this.props;
    if (onError) {
      onError({
        error: {
          title: 'Native player error',
          message: `${JSON.stringify(error)}`,
        },
      });
    }
  }

  onProgress = () => {
    if (!this.videoRef.current) {
      return;
    }

    const { player } = window;
    const bandwidth = player ? player.getStats().streamBandwidth : 0;

    const payload = {
      currentTime: this.videoRef.current.currentTime,
      seekableDuration: this.videoRef.current.duration,
      streamBitRate: bandwidth,
    };

    // notify
    const { onProgress } = this.props;
    if (onProgress) {
      onProgress(payload);
    }
  };

  onEnd = () => {
    this.onProgress();
    this.stopProgressTimer();

    // notify
    const { onEnd } = this.props;
    if (onEnd) {
      onEnd();
    }
  };

  onReadyForDisplay = () => {
    const { onReadyForDisplay } = this.props;
    if (onReadyForDisplay) {
      onReadyForDisplay();
    }
  };

  onPause = () => {
    this.stopProgressTimer();
  };

  onPlay = () => {
    this.startProgressTimer();
  };

  onLoad = () => {
    const width = this.videoRef.current.videoWidth;
    const height = this.videoRef.current.videoHeight;
    const payload = {
      currentPosition: this.videoRef.current.currentTime,
      duration: this.videoRef.current.duration,
      naturalSize: {
        width,
        height,
        orientation: width >= height ? 'landscape' : 'portrait',
      },
    };
    // notify
    const { onLoad } = this.props;
    if (onLoad) {
      onLoad(payload);
    }
  };

  base64Encode(str) {
    return btoa(this.utf8Encode(str));
  }

  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  async buildPlayer() {
    try {
      const { source } = this.props;

      // create player instance once
      if (!window.player) {
        window.player = new shaka.Player();
      }
      // attach video
      const video = this.videoRef.current;
      if (video) {
        window.player.attach(video);
      }

      // intialize with media source
      await this.initPlayer(source);
    } catch (error) {
      this.onError(error);
    }
  }

  shutdownPlayer() {
    const { player } = window;
    if (player) {
      // detach from view
      player.detach();

      // make sure no request/response filters are registered
      player.getNetworkingEngine().clearAllRequestFilters();
      player.getNetworkingEngine().clearAllResponseFilters();
    }
  }

  async initPlayer(source) {
    try {
      const { player } = window;
      const { uri, drm } = source;
      // ignore invalid source uri
      if (!uri) {
        return;
      }
      // optional drm object
      const { customerId, deviceId, licenseUrl } = drm || {};
      const { drmKeyRobustness } = this.state;

      // reconfigure player
      player.configure({
        // https://shaka-player-demo.appspot.com/docs/api/shaka.extern.html#.AbrConfiguration
        abr: {
          // bandwidthDowngradeTarget: The largest fraction of the estimated bandwidth we should use. We should downgrade to avoid this.
          bandwidthDowngradeTarget: 0.95,

          // bandwidthUpgradeTarget: The fraction of the estimated bandwidth which we should try to use when upgrading.
          bandwidthUpgradeTarget: 0.85,

          // The default bandwidth estimate to use if there is not enough data, in bit/sec.
          defaultBandwidthEstimate: 1200000,

          // If true, enable adaptation by the current AbrManager.
          enabled: true,

          // The minimum amount of time that must pass between switches, in seconds. This keeps us from changing too often and annoying the user.
          switchInterval: 5,
        },
        // https://shaka-player-demo.appspot.com/docs/api/shaka.extern.html#.StreamingConfiguration
        streaming: {
          // The minimum number of seconds of content that the StreamingEngine must buffer before it can begin playback or can
          // continue playback after it has entered into a buffering state (i.e., after it has depleted one more more of its buffers).
          rebufferingGoal: 2,

          // bufferingGoal: The number of seconds of content that the StreamingEngine will attempt to buffer ahead of the playhead.
          // This value must be greater than or equal to the rebuffering goal.
          bufferingGoal: 6,
        },
        drm: {
          servers: {
            'com.widevine.alpha': licenseUrl,
          },
          advanced: {
            'com.widevine.alpha': {
              persistentStateRequired: true,
              videoRobustness: drmKeyRobustness,
              audioRobustness: drmKeyRobustness,
              // videoRobustness: 'SW_SECURE_CRYPTO',
              // audioRobustness: 'SW_SECURE_CRYPTO',
            },
          },
        },
        manifest: {
          dash: {
            ignoreMinBufferTime: true,
            // defaultPresentationDelay: 20,
          },
        },
      });

      // attach new request filter
      player.getNetworkingEngine().clearAllRequestFilters();
      player.getNetworkingEngine().registerRequestFilter((type, request) => {
        if (type === shaka.net.NetworkingEngine.RequestType.APP) {
          // ignore
        }

        if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
          request.allowCrossSiteCredentials = false;
          const wrapped = {};
          wrapped.LatensRegistration = {
            CustomerName: customerId,
            AccountName: 'PlayReadyAccount',
            PortalId: deviceId,
            FriendlyName: 'ShakaPlayer',
            DeviceInfo: {
              FormatVersion: '1',
              DeviceType: 'Web',
              OSType: 'Tizen',
              OSVersion: '0.0.0',
              DRMProvider: 'Google',
              DRMVersion: '1.4.8.86',
              DRMType: 'Widevine',
              DeviceVendor: 'Samsung',
              DeviceModel: 'Tizen',
            },
          };

          wrapped.Payload = fromByteArray(new Uint8Array(request.body));
          const wrappedJson = JSON.stringify(wrapped);
          request.body = fromByteArray(new TextEncoder().encode(wrappedJson));
        }
      });

      // attach new response filter
      player.getNetworkingEngine().clearAllResponseFilters();
      player.getNetworkingEngine().registerResponseFilter((type, response) => {
        // Only manipulate license responses:
        if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
          try {
            const responseString = String.fromCharCode.apply(
              String,
              new Uint8Array(response.data),
            );
            let responseJson;
            try {
              responseJson = JSON.parse(responseString);
            } catch (error) {
              // not a license response, return challenge
              return response;
            }
            // This is a base64-encoded version of the raw license.
            const rawLicenseBase64 = responseJson.license;
            // Decode that base64 string into a Uint8Array and replace the response
            // data.  The raw license will be fed to the Widevine CDM.
            response.data = toByteArray(rawLicenseBase64);
          } catch (error) {
            // notify drm issue
            this.onError(error);
          }
        }
      });

      // load media resource
      try {
        await player.load(uri);
      } catch (error) {
        const { code } = error;

        // REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE
        if (code === 6001 && drmKeyRobustness !== lowestKeyRobustness) {
          // try lowering key security robustness
          this.state = { drmKeyRobustness: lowestKeyRobustness };
          this.initPlayer(source);
        }
        // LOAD_INTERRUPTED || OPERATION_ABORTED
        else if (code === 7000 || code === 7001) {
          // silently catch LOAD_INTERRUPTED (7000) and OPERATION_ABORTED (7001) errors when switching to a new stream
        } else {
          console.log('LOAD', `${JSON.stringify(error)}`);
          throw error;
        }
      }
    } catch (error) {
      this.onError(error);
    }
  }

  reloadSource(source) {
    // reinit player with new source
    this.initPlayer(source);
  }

  startProgressTimer() {
    if (!this.progressTimer) {
      this.onProgress();
      this.progressTimer = setInterval(this.onProgress, progressUpdateInterval);
    }
  }

  utf8Encode(a) {
    return unescape(encodeURIComponent(a));
  }

  stopProgressTimer() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  requestPlay() {
    const video = this.videoRef.current;
    if (!video) {
      return;
    }
    const playPromise = video.play();
    if (playPromise) {
      playPromise
        .then(() => {})
        .catch(e => {
          /* This is likely one of:
           * name: NotAllowedError - autoplay is not supported
           * name: NotSupportedError - format is not supported
           */
          this.onError({ code: e.name, message: e.message });
        });
    }
  }

  paused(value) {
    if (value) {
      this.videoRef.current.pause();
    } else {
      this.requestPlay();
    }
  }

  seek(value) {
    this.videoRef.current.currentTime = value;
  }

  render() {
    const { repeat, style, resizeMode } = this.props;
    const videoElement = createElement('video', {
      ref: this.videoRef,
      autoPlay: true,
      loop: repeat,
      style: [style, styles.video, { objectFit: resizeMode }],
    });
    return videoElement;
  }
}

Video.propTypes = {
  repeat: PropTypes.bool,
  autoPlay: PropTypes.bool,
  paused: PropTypes.bool,
  source: PropTypes.shape({
    uri: PropTypes.string,
    drm: PropTypes.shape({
      licenseUrl: PropTypes.string,
      deviceId: PropTypes.string,
      customerId: PropTypes.string,
      castToken: PropTypes.string,
    }),
  }),
  onLoad: PropTypes.func,
  onProgress: PropTypes.func,
  onReadyForDisplay: PropTypes.func,
  onEnd: PropTypes.func,
  onError: PropTypes.func,
};

Video.defaultProps = {
  repeat: false,
  autoPlay: false,
  paused: false,
  source: {
    uri: null,
    drm: {},
  },
  onLoad: () => {},
  onProgress: () => {},
  onReadyForDisplay: () => {},
  onEnd: () => {},
  onError: () => {},
};

export default Video;