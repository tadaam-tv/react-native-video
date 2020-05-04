class PlayerEventListener {
  player = null;

  onLogMessage = null;

  attach(player, onLogMessage = () => {}) {
    this.player = player;
    this.onLogMessage = onLogMessage;
    player.addEventListener(
      "abrstatuschanged",
      this.onPlayerAbrStatusChangedEvent
    );
    player.addEventListener("adaptation", this.onPlayerAdaptionEvent);
    player.addEventListener("buffering", this.onPlayerBufferingEvent);
    player.addEventListener(
      "drmsessionupdate",
      this.onPlayerDrmSessionUpdateEvent
    );
    player.addEventListener("emsg", this.onPlayerEmsgEvent);
    player.addEventListener("error", this.onPlayerErrorEvent);
    player.addEventListener(
      "expirationupdated",
      this.onPlayerExpirationUpdatedEvent
    );
    player.addEventListener("largegap", this.onPlayerLargeGapEvent);
    player.addEventListener("loading", this.onPlayerLoadingEvent);
    player.addEventListener("manifestparsed", this.onPlayerManifestParsedEvent);
    player.addEventListener("onstatechange", this.onPlayerStateChangeEvent);
    player.addEventListener("onstateidle", this.onPlayerStateIdleEvent);
    player.addEventListener("streaming", this.onPlayerStreamingEvent);
    player.addEventListener("unloading", this.onPlayerUnloadingEvent);
    player.addEventListener("variantchanged", this.onPlayerVariantChangedEvent);
  }

  detach() {
    player.removeEventListener(
      "abrstatuschanged",
      this.onPlayerAbrStatusChangedEvent
    );
    player.removeEventListener("adaptation", this.onPlayerAdaptionEvent);
    player.removeEventListener("buffering", this.onPlayerBufferingEvent);
    player.removeEventListener(
      "drmsessionupdate",
      this.onPlayerDrmSessionUpdateEvent
    );
    player.removeEventListener("emsg", this.onPlayerEmsgEvent);
    player.removeEventListener("error", this.onPlayerErrorEvent);
    player.removeEventListener(
      "expirationupdated",
      this.onPlayerExpirationUpdatedEvent
    );
    player.removeEventListener("largegap", this.onPlayerLargeGapEvent);
    player.removeEventListener("loading", this.onPlayerLoadingEvent);
    player.removeEventListener(
      "manifestparsed",
      this.onPlayerManifestParsedEvent
    );
    player.removeEventListener("onstatechange", this.onPlayerStateChangeEvent);
    player.removeEventListener("onstateidle", this.onPlayerStateIdleEvent);
    player.removeEventListener("streaming", this.onPlayerStreamingEvent);
    player.removeEventListener("unloading", this.onPlayerUnloadingEvent);
    player.removeEventListener(
      "variantchanged",
      this.onPlayerVariantChangedEvent
    );
  }

  onPlayerAbrStatusChangedEvent = data => {
    this.onLogMessage("abrstatuschanged", `enabled: ${data && data.newStatus}`);
  };

  onPlayerAdaptionEvent = () => {
    this.onLogMessage(
      "adaptation",
      "an automatic adaptation causes the active tracks to change"
    );
  };

  onPlayerBufferingEvent = data => {
    this.onLogMessage("buffering", data && data.buffering);
  };

  onPlayerDrmSessionUpdateEvent = () => {
    this.onLogMessage(
      "drmsessionupdate",
      "the CDM has accepted the license response"
    );
  };

  onPlayerEmsgEvent = data => {
    this.onLogMessage("emsg", data && JSON.stringify(data.detail));
  };

  onPlayerErrorEvent = data => {
    this.onLogMessage("error", data && JSON.stringify(data.detail));
  };

  onPlayerExpirationUpdatedEvent = () => {
    this.onLogMessage(
      "expirationupdated",
      "there is a change in the expiration times of an EME session"
    );
  };

  onPlayerLargeGapEvent = data => {
    this.onLogMessage(
      "largegap",
      `the playhead enters a large gap: currenTime=${data &&
        data.currentTime}; gapSize=${data && data.gapSize}`
    );
  };

  onPlayerLoadingEvent = () => {
    this.onLogMessage("loading", `the player begins loading`);
  };

  onPlayerManifestParsedEvent = () => {
    this.onLogMessage("manifestparsed", `the manifest has been parsed`);
  };

  onPlayerStateChangeEvent = data => {
    this.onLogMessage("onstatechange", `${data && JSON.stringify(data.state)}`);
  };

  onPlayerStateIdleEvent = data => {
    this.onLogMessage("onstateidle", `state: ${data && data.state}`);
  };

  onPlayerStreamingEvent = () => {
    this.onLogMessage(
      "streaming",
      "the manifest has been parsed and track information is available"
    );
  };

  onPlayerUnloadingEvent = () => {
    this.onLogMessage("unloading", "the player unloads or fails to load");
  };

  onPlayerVariantChangedEvent = () => {
    this.onLogMessage(
      "variantchanged",
      "a call from the application caused a variant change"
    );
  };
}

export default PlayerEventListener;
