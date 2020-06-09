import React, { Component } from "react";
import { createElement, View } from "react-native";
import shaka from "shaka-player";
import PropTypes from "prop-types";
import styles from "./Video.styles";
import PlayerEventListener from "./PlayerEventListener";
import LicenseHelper from "./LicenseHelper";
import buildDefaultShakaConfig from "./Video.config";
const progressUpdateInterval = 250.0;

const defaultKeyRobustness = "HW_SECURE_ALL";
const lowestKeyRobustness = "SW_SECURE_CRYPTO";
const drmErrorCode = "TDM_PLAYER_DRM011";

class Video extends Component {
  playerEventListener = null;

  constructor(props) {
    super(props);
    this.videoRef = React.createRef();
    this.state = { drmKeyRobustness: defaultKeyRobustness };
  }

  initLog() {
    // shaka.log.setLevel(5);
  }

  componentDidMount() {
    // Install built-in polyfills to patch browser incompatibilities.
    shaka.polyfill.installAll();
    if (shaka.log) {
      this.initLog();
    }

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

    // destroy player
    this.shutdownPlayer();
  }

  onPlayerErrorEvent = (event) => {
    // Extract the shaka.util.Error object from the event.
    const { detail } = event;

    // optionally extract code
    var code = null;
    if (detail) {
      code = detail.code;
      // map DRM failure to known DRM error code
      if (code === 6007 /*LICENSE_REQUEST_FAILED*/) {
        code = drmErrorCode;
      }
    }
    this.onError(detail, code);
  };

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
          code,
        },
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
      streamBitRate: bandwidth,
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
        orientation: width >= height ? "landscape" : "portrait",
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
      video.addEventListener("error", this.onPlayerErrorEvent);
      video.addEventListener("ended", this.onEnd);
      video.addEventListener("loadeddata", this.onLoad);
      video.addEventListener("canplay", this.onReadyForDisplay);
      video.addEventListener("pause", this.onPause);
      video.addEventListener("play", this.onPlay);

      playerEventListener = new PlayerEventListener();
      playerEventListener.attach(player, this.logMessage);
      player.addEventListener("error", this.onPlayerErrorEvent);

      // intialize with media source
      await this.initPlayer();
    } catch (error) {
      this.onError(error);
    }
  }

  logMessage = (msg, body) => {
    console.log(msg, body);
    const { onDebug } = this.props;
    if (onDebug) {
      onDebug(msg, body);
    }
  };

  get playerVersion() {
    return shaka ? shaka.Player.version + "_fix" : null;
  }

  shutdownPlayer() {
    // detach listeners
    const video = this.videoRef.current;
    if (video) {
      video.removeEventListener("error", this.onPlayerErrorEvent);
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
      player.removeEventListener("error", this.onPlayerErrorEvent);

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
      const { customerId, deviceId, licenseUrl, drmType } = drm || {};

      // configure player
      const { drmKeyRobustness } = this.state;
      const shakaConfig =
        config ||
        buildDefaultShakaConfig(licenseUrl, drmType, drmKeyRobustness);
      const configSuccess = player.configure(shakaConfig);

      this.logMessage(
        "configuration",
        JSON.stringify(player.getConfiguration())
      );

      // attach new request filter
      player.getNetworkingEngine().clearAllRequestFilters();
      player.getNetworkingEngine().registerRequestFilter((type, request) => {
        if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
          if (drmType === "playready") {
            return LicenseHelper.buildPlayReadyRequest(
              customerId,
              deviceId,
              request
            );
          } else {
            return LicenseHelper.buildWidevineRequest(
              customerId,
              deviceId,
              request
            );
          }
        }
      });

      // attach new response filter
      player.getNetworkingEngine().clearAllResponseFilters();
      player.getNetworkingEngine().registerResponseFilter((type, response) => {
        if (type === shaka.net.NetworkingEngine.RequestType.MANIFEST) {
          this.logMessage("network manifest", JSON.stringify(response));
        }
        if (type === shaka.net.NetworkingEngine.RequestType.SEGMENT) {
          //this.logMessage("network segment", JSON.stringify(response));
        }
        // Only manipulate license responses:
        if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
          try {
            // check license type
            if (drmType === "playready") {
              return LicenseHelper.handlePlayReadyResponse(response);
            } else {
              return LicenseHelper.handleWidevineResponse(response);
            }
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
      } catch (error) {
        const { code } = error;

        this.logMessage("error", JSON.stringify(error));

        // REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE
        const { drmKeyRobustness } = this.state;
        if (code === 6001 && drmKeyRobustness !== lowestKeyRobustness) {
          // try lowering key security robustness
          this.state = { drmKeyRobustness: lowestKeyRobustness };
          this.initPlayer(source);
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

  logExpiration(player) {
    const exp = player.getExpiration();
    const expStr =
      exp === Infinity
        ? "Infinity"
        : new Date(player.getExpiration()).toISOString();
    this.logMessage(
      "expiration time",
      `next expiration time for any EME session: ${expStr}`
    );
    if (player.drmEngine_) {
      const sessionIds = player.drmEngine_.getSessionIds();
      this.logMessage("session ids", `${JSON.stringify(sessionIds)}`);
      const keyIds = player.drmEngine_.keyStatusByKeyId_;
      this.logMessage("keyIds", `${JSON.stringify(keyIds)}`);
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
      controls: false,
      style: [style, styles.video, { objectFit: resizeMode }],
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
      castToken: PropTypes.string,
    }),
  }),
  onLoad: PropTypes.func,
  onProgress: PropTypes.func,
  onReadyForDisplay: PropTypes.func,
  onEnd: PropTypes.func,
  onError: PropTypes.func,
  onDebug: PropTypes.func,
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
  onDebug: () => {},
};

export default Video;
