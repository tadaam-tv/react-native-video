import React, { Component } from "react";
import { createElement, View } from "react-native";
import { fromByteArray, toByteArray } from "base64-js";
import shaka from "shaka-player/dist/shaka-player.compiled";
import PropTypes from "prop-types";
import styles from "./Video.styles";
import PlayerEventListener from "./PlayerEventListener";

const progressUpdateInterval = 250.0;
const drmErrorCode = "TDM_PLAYER_DRM011";

class Video extends Component {
  playerEventListener = null;

  logTimer = null;

  constructor(props) {
    super(props);
    this.videoRef = React.createRef();
  }

  componentDidMount() {
    // Install built-in polyfills to patch browser incompatibilities.
    //shaka.polyfill.installAll();
    //shaka.log.setLevel(shaka.log.Level.V1);

    // Check to see if the browser supports the basic APIs Shaka needs.
    if (shaka.Player.isBrowserSupported()) {
      const video = this.videoRef.current;

      // create a player
      this.buildPlayer(video);
    } else {
      // This browser does not have the minimum set of APIs we need.
      this.logMessage("Init", "Browser not supported!");
    }
  }

  componentDidUpdate(prevProps) {
    const { paused, source } = this.props;
    const { paused: wasPaused, source: prevSource } = prevProps;

    if (source.uri !== prevSource.uri) {
      this.logMessage(
        "video_update",
        `source: ${source.uri} prevSource: ${prevSource.uri} paused: ${paused} wasPause: ${wasPaused}`
      );
    }

    // check for updated manifest uri
    if (source.uri !== prevSource.uri) {
      this.reloadSource();
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
    } else {
      this.logMessage("error", "No video component");
    }
  }

  componentWillUnmount() {
    this.stopProgressTimer();

    this.stopLogTimer();

    // destroy player
    this.shutdownPlayer();
  }

  onErrorEvent(event) {
    this.logMessage("onErrorEvent", JSON.stringify(event));
    // Extract the shaka.util.Error object from the event.
    this.onError(event.detail);
  }

  // eslint-disable-next-line class-methods-use-this
  onError(error, code = null) {
    this.logMessage("onError", JSON.stringify(error));
    // Log the error.
    const { onError } = this.props;
    if (onError) {
      onError({
        error: {
          title: "Native player error",
          message: `${JSON.stringify(error)}`,
          code
        }
      });
    }
  }

  onProgress = () => {
    const video = this.videoRef.current;
    if (!video) {
      return;
    }

    const { player } = window;
    let bandwidth = 0;
    if (player) {
      bandwidth = player.getStats().streamBandwidth;
    }

    const payload = {
      currentTime: video.currentTime,
      seekableDuration: this.seekableDuration,
      streamBitRate: bandwidth
    };

    // notify
    const { onProgress } = this.props;
    if (onProgress) {
      onProgress(payload);
    }
  };

  onEnd = () => {
    this.logMessage("onEnd");
    this.onProgress();
    this.stopProgressTimer();

    // notify
    const { onEnd } = this.props;
    if (onEnd) {
      onEnd();
    }
  };

  onReadyForDisplay = () => {
    this.logMessage("onReadyForDisplay");
    const { onReadyForDisplay } = this.props;
    if (onReadyForDisplay) {
      onReadyForDisplay();
    }
  };

  onPause = () => {
    this.logMessage("onPause");
    this.stopProgressTimer();
  };

  onPlay = () => {
    this.logMessage("onPlay");
    this.startProgressTimer();
  };

  get seekableDuration() {
    // get seekable duration from player's seekrange instead of video duration
    // for open streams this gives a correct result.
    let seekableDuration = 0;
    const { player } = window;
    if (player) {
      const { start, end } = player.seekRange();
      seekableDuration = end - start;
    }
    return seekableDuration;
  }

  onLoad = () => {
    const video = this.videoRef.current;
    if (!video) {
      return;
    }

    this.logMessage("onLoad");

    const { width, height, currentTime: currentPosition } = video;
    const payload = {
      currentPosition,
      duration: this.seekableDuration,
      naturalSize: {
        width,
        height,
        orientation: width >= height ? "landscape" : "portrait"
      }
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
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  async buildPlayer() {
    try {
      // create player instance
      const player = new shaka.Player();
      window.player = player;

      // attach video
      const video = this.videoRef.current;
      if (video) {
        await player.attach(video);
      }

      // attach listeners
      video.addEventListener("error", this.onErrorEvent);
      video.addEventListener("ended", this.onEnd);
      video.addEventListener("loadeddata", this.onLoad);
      video.addEventListener("canplay", this.onReadyForDisplay);
      video.addEventListener("pause", this.onPause);
      video.addEventListener("play", this.onPlay);

      playerEventListener = new PlayerEventListener();
      playerEventListener.attach(player, this.logMessage);

      // intialize with media source
      await this.initPlayer();
    } catch (error) {
      this.onError(error);
    }
  }

  logMessage = (msg, body) => {
    const { onDebug } = this.props;
    if (onDebug) {
      onDebug(msg, body);
    }
  };

  shutdownPlayer() {
    // detach listeners
    const video = this.videoRef.current;
    if (video) {
      video.removeEventListener("error", this.onErrorEvent);
      video.removeEventListener("ended", this.onEnd);
      video.removeEventListener("loadeddata", this.onLoad);
      video.removeEventListener("canplay", this.onReadyForDisplay);
      video.removeEventListener("pause", this.onPause);
      video.removeEventListener("play", this.onPlay);
    }

    // detach and clean-up player
    const { player } = window;
    if (player) {
      // remove listeners
      if (this.playerEventListener) {
        this.playerEventListener.detach();
      }

      // make sure no request/response filters are registered
      player.getNetworkingEngine().clearAllRequestFilters();
      player.getNetworkingEngine().clearAllResponseFilters();

      // detach from view
      player.detach();
      this.logMessage("shutdown");
    }
  }

  async initPlayer() {
    try {
      const { source, config } = this.props;
      const { player } = window;
      const { uri, drm } = source;
      // ignore invalid source uri
      if (!uri) {
        return;
      }
      this.logMessage("init", JSON.stringify(source));

      // optional drm object
      const { customerId, deviceId, licenseUrl } = drm || {};

      // configure player
      const shakaConfig = config || buildShakaConfig(licenseUrl);
      player.configure(shakaConfig);

      this.logMessage(
        "configuration",
        JSON.stringify(player.getConfiguration())
      );

      // attach new request filter
      player.getNetworkingEngine().clearAllRequestFilters();
      player.getNetworkingEngine().registerRequestFilter((type, request) => {
        if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
          request.allowCrossSiteCredentials = false;
          const wrapped = {};
          wrapped.LatensRegistration = {
            CustomerName: customerId,
            AccountName: "PlayReadyAccount",
            PortalId: deviceId,
            FriendlyName: "ShakaPlayer",
            DeviceInfo: {
              FormatVersion: "1",
              DeviceType: "Web",
              OSType: "Tizen",
              OSVersion: "0.0.0",
              DRMProvider: "Google",
              DRMVersion: "1.4.8.86",
              DRMType: "Widevine",
              DeviceVendor: "Samsung",
              DeviceModel: "Tizen"
            }
          };

          wrapped.Payload = fromByteArray(new Uint8Array(request.body));
          const wrappedJson = JSON.stringify(wrapped);
          request.body = fromByteArray(new TextEncoder().encode(wrappedJson));

          this.logMessage("network license request", request.body);
        }
      });

      // attach new response filter
      player.getNetworkingEngine().clearAllResponseFilters();
      player.getNetworkingEngine().registerResponseFilter((type, response) => {
        if (type === shaka.net.NetworkingEngine.RequestType.MANIFEST) {
          this.logMessage("network manifest", JSON.stringify(response));
        }
        if (type === shaka.net.NetworkingEngine.RequestType.SEGMENT) {
          this.logMessage("network segment", JSON.stringify(response));
        }
        // Only manipulate license responses:
        if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
          try {
            const responseString = String.fromCharCode.apply(
              String,
              new Uint8Array(response.data)
            );
            this.logMessage("network license", responseString);
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
            this.logMessage("network license error", JSON.stringify(error));
            this.onError(error, drmErrorCode);
          }
        }
        if (type === shaka.net.NetworkingEngine.RequestType.APP) {
          this.logMessage("network app", JSON.stringify(response));
        }
        if (type === shaka.net.NetworkingEngine.RequestType.TIMING) {
          this.logMessage("network timing", JSON.stringify(response));
        }
      });

      // load media resource
      try {
        await player.load(uri);

        // log seek range
        this.logMessage("seekRange", JSON.stringify(player.seekRange()));

        // log interval
        this.stopLogTimer();
        this.logTimer = setInterval(() => {
          const isLive = player.isLive();
          if (isLive) {
            const presentationStartTime = player.getPresentationStartTimeAsDate();
            const playheadTime = player.getPlayheadTimeAsDate();
            const bufferedInfo = player.getBufferedInfo();
            const isBuffering = player.isBuffering();
            const isInProgress = player.isInProgress();
            this.logMessage(
              "status",
              `isBuffering: ${isBuffering}; isInProgress: ${isInProgress}`
            );
            this.logManifest(player.getManifest());
            this.logMessage(
              "live presentationStart time",
              presentationStartTime.toLocaleString()
            );
            this.logMessage(
              "live playhead time",
              playheadTime.toLocaleString()
            );
            const { total } = bufferedInfo;
            if (total && total.length > 0) {
              const s = total[0].start;
              const e = total[0].end;
              const t0 = new Date(presentationStartTime);
              t0.setSeconds(t0.getSeconds() + s);
              const t1 = new Date(presentationStartTime);
              t1.setSeconds(t1.getSeconds() + e);
              this.logMessage(
                "buffered time",
                `[${t0.toLocaleString()} to ${t1.toLocaleString()}]`
              );
            }
          }
        }, 2500);
      } catch (error) {
        const { code } = error;

        this.logMessage("error", JSON.stringify(error));

        // REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE
        if (code === 6001) {
          // TODO: try lowering key security robustness
        }
        // LOAD_INTERRUPTED || OPERATION_ABORTED
        else if (code === 7000 || code === 7001) {
          // silently catch LOAD_INTERRUPTED (7000) and OPERATION_ABORTED (7001) errors when switching to a new stream
        } else {
          throw error;
        }
      }

      const drmInfo = player.drmInfo();
      this.logMessage("drmInfo", JSON.stringify(drmInfo));
    } catch (error) {
      this.logMessage("Player init error", JSON.stringify(error));
      this.onError(error);
    }
  }

  epochToString(sec) {
    const t = new Date(null);
    t.setSeconds(sec);
    return t.toLocaleString();
  }

  logManifest(manifest) {
    if (manifest) {
      const tl = manifest.presentationTimeline;
      const delay = tl.getDelay();
      const maxSegmentDuration = tl.getMaxSegmentDuration();
      // const presStartTime = this.epochToString(tl.getPresentationStartTime());
      const seekRangeStart = this.epochToString(
        tl.getPresentationStartTime() + tl.getSeekRangeStart()
      );
      const seekRangeEnd = this.epochToString(
        tl.getPresentationStartTime() + tl.getSeekRangeEnd()
      );
      const usingPresentationStartTime = tl.usingPresentationStartTime();
      //const isInProgress = tl.isInProgress();
      let body = "";
      //body += `isInProgress: ${isInProgress}; `;
      body += `delay: ${delay}s; `;
      body += `maxSegmentDuration: ${maxSegmentDuration}s; `;
      body += `seekRange: [${seekRangeStart} - ${seekRangeEnd}]; `;
      body += `usingPresentationStartTime: ${usingPresentationStartTime}; `;
      this.logMessage("manifest", body);
    }
  }

  reloadSource() {
    this.logMessage("reloadSource");
    // reinit player with new source
    this.initPlayer();
  }

  startProgressTimer() {
    this.stopProgressTimer();
    this.onProgress();
    this.progressTimer = setInterval(this.onProgress, progressUpdateInterval);
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

  stopLogTimer() {
    if (this.logTimer) {
      clearInterval(this.logTimer);
      this.logTimer = null;
    }
  }

  async requestPlay() {
    this.logMessage("requestPlay");
    const video = this.videoRef.current;
    if (!video) {
      this.logMessage("error", "No video component");
      return;
    }
    try {
      await video.play();
    } catch (error) {
      /* This is likely one of:
       * name: NotAllowedError - autoplay is not supported
       * name: NotSupportedError - format is not supported
       */
      this.logMessage("Player play error", JSON.stringify(error));
      this.onError({ code: error.name, message: error.message });
    }
  }

  paused(value) {
    this.logMessage("paused", value);
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

    const videoElement = createElement("video", {
      ref: this.videoRef,
      autoPlay: true,
      loop: repeat,
      controls: true,
      style: [style, styles.video, { objectFit: resizeMode }]
    });
    return videoElement;
  }
}

Video.propTypes = {
  repeat: PropTypes.bool,
  autoPlay: PropTypes.bool,
  paused: PropTypes.bool,
  config: PropTypes.shape({}),
  source: PropTypes.shape({
    uri: PropTypes.string,
    drm: PropTypes.shape({
      licenseUrl: PropTypes.string,
      deviceId: PropTypes.string,
      customerId: PropTypes.string,
      castToken: PropTypes.string
    })
  }),
  onLoad: PropTypes.func,
  onProgress: PropTypes.func,
  onReadyForDisplay: PropTypes.func,
  onEnd: PropTypes.func,
  onError: PropTypes.func,
  onDebug: PropTypes.func
};

Video.defaultProps = {
  repeat: false,
  autoPlay: false,
  paused: false,
  source: {
    uri: null,
    drm: {}
  },
  onLoad: () => {},
  onProgress: () => {},
  onReadyForDisplay: () => {},
  onEnd: () => {},
  onError: () => {},
  onDebug: () => {}
};

export default Video;
