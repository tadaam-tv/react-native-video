package com.brentvatne.exoplayer;

import android.util.Log;

import com.google.android.exoplayer2.Format;
import com.google.android.exoplayer2.source.TrackGroup;
import com.google.android.exoplayer2.trackselection.AdaptiveTrackSelection;
import com.google.android.exoplayer2.trackselection.TrackSelection;
import com.google.android.exoplayer2.upstream.BandwidthMeter;
import com.google.android.exoplayer2.util.Clock;

import androidx.annotation.Nullable;

public class LimitTrackSelection extends AdaptiveTrackSelection {

    private static final int maxBitrate = 2800000;

    public static AdaptiveTrackSelection.Factory buildFactory(int minDurationForQualityIncreaseMs,
                                             int maxDurationForQualityDecreaseMs,
                                             int minDurationToRetainAfterDiscardMs,
                                             float bandwidthFraction
                                             ) {
            return new AdaptiveTrackSelection.Factory(minDurationForQualityIncreaseMs, maxDurationForQualityDecreaseMs, minDurationToRetainAfterDiscardMs, bandwidthFraction) {
                @Override
                protected AdaptiveTrackSelection createAdaptiveTrackSelection(
                        TrackGroup group, BandwidthMeter bandwidthMeter, int[] tracks) {
                    return new LimitTrackSelection(group,
                            tracks,
                            bandwidthMeter,
                            minDurationForQualityIncreaseMs,
                            maxDurationForQualityDecreaseMs,
                            minDurationToRetainAfterDiscardMs,
                            bandwidthFraction,
                            DEFAULT_BUFFERED_FRACTION_TO_LIVE_EDGE_FOR_QUALITY_INCREASE,
                            DEFAULT_MIN_TIME_BETWEEN_BUFFER_REEVALUTATION_MS,
                            Clock.DEFAULT);
                }
            };
        }

    public LimitTrackSelection(TrackGroup group, int[] tracks, BandwidthMeter bandwidthMeter) {
        super(group, tracks, bandwidthMeter);
    }

    public LimitTrackSelection(TrackGroup group, int[] tracks, BandwidthMeter bandwidthMeter, long minDurationForQualityIncreaseMs, long maxDurationForQualityDecreaseMs, long minDurationToRetainAfterDiscardMs, float bandwidthFraction, float bufferedFractionToLiveEdgeForQualityIncrease, long minTimeBetweenBufferReevaluationMs, Clock clock) {
        super(group, tracks, bandwidthMeter, minDurationForQualityIncreaseMs, maxDurationForQualityDecreaseMs, minDurationToRetainAfterDiscardMs, bandwidthFraction, bufferedFractionToLiveEdgeForQualityIncrease, minTimeBetweenBufferReevaluationMs, clock);
    }

    private boolean isWithinLimit(int trackBitrate) {
        return trackBitrate <= maxBitrate;
    }

    @Override
    protected boolean canSelectFormat(
            Format format, int trackBitrate, float playbackSpeed, long effectiveBitrate) {

        boolean isWithinLimit = this.isWithinLimit(trackBitrate);
        boolean isSelectable = Math.round(trackBitrate * playbackSpeed) <= effectiveBitrate;
        Log.d("OMX", "canSelectFormat " + isWithinLimit + " " + isSelectable);
        return isSelectable && isWithinLimit;
    }
}
