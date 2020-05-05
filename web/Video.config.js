function buildDefaultShakaConfig(licenseUrl, drmType = 'playready', drmKeyRobustness = 'HW_SECURE_ALL') {
    const config =  {
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
        switchInterval: 10
      },
      // https://shaka-player-demo.appspot.com/docs/api/shaka.extern.html#.StreamingConfiguration
      streaming: {
        // The minimum number of seconds of content that the StreamingEngine must buffer before it can begin playback or can
        // continue playback after it has entered into a buffering state (i.e., after it has depleted one more more of its buffers).
        rebufferingGoal: 5,

        // bufferingGoal: The number of seconds of content that the StreamingEngine will attempt to buffer ahead of the playhead.
        // This value must be greater than or equal to the rebuffering goal.
        bufferingGoal: 6
      },
      drm: {},
      manifest: {
        dash: {
          ignoreMinBufferTime: true
          // defaultPresentationDelay: 20,
        }
      }
    };
    if (drmType === 'playready') {
      config.drm.servers = {
        "com.microsoft.playready": licenseUrl,
      };
      config.drm.advanced = {
        "com.microsoft.playready": {
          persistentStateRequired: true,
          videoRobustness: drmKeyRobustness,
          audioRobustness: drmKeyRobustness
        }
      };
    }
    if (drmType === 'widevine') {
      config.drm.servers = {
        "com.widevine.alpha": licenseUrl,
      };
      config.drm.advanced = {
        "com.widevine.alpha": {
          persistentStateRequired: true,
          videoRobustness: drmKeyRobustness,
          audioRobustness: drmKeyRobustness
        }
      };
    }
    return config;
}

export default buildDefaultShakaConfig;