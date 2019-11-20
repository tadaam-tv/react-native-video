package com.brentvatne.exoplayer;

import com.google.android.exoplayer2.mediacodec.MediaCodecInfo;
import com.google.android.exoplayer2.mediacodec.MediaCodecSelector;
import com.google.android.exoplayer2.mediacodec.MediaCodecUtil;

import java.util.ArrayList;
import java.util.List;

import androidx.annotation.Nullable;

public class BlackListMediaCodecSelector implements MediaCodecSelector {

    // list of strings used in blacklisting codecs
    //final static String[] BLACKLISTEDCODECS = {};

    final static String[] BLACKLISTEDCODECS = {"OMX.amlogic.avc.decoder.awesome.secure"};

    @Override
    public List<MediaCodecInfo> getDecoderInfos(String mimeType, boolean requiresSecureDecoder, boolean requiresTunnelingDecoder) throws MediaCodecUtil.DecoderQueryException {

        List<MediaCodecInfo> codecInfos = MediaCodecUtil.getDecoderInfos(
                mimeType, requiresSecureDecoder, requiresTunnelingDecoder);
        // filter codecs based on blacklist template
        List<MediaCodecInfo> filteredCodecInfos = new ArrayList<>();
        for (MediaCodecInfo codecInfo: codecInfos) {
            boolean blacklisted = false;
            for (String blackListedCodec: BLACKLISTEDCODECS) {
                if (codecInfo.name.contains(blackListedCodec)) {
                    blacklisted = true;
                    break;
                }
            }
            if (!blacklisted) {
                filteredCodecInfos.add(codecInfo);
            }
        }
        return filteredCodecInfos;
    }

    @Nullable
    @Override
    public MediaCodecInfo getPassthroughDecoderInfo() throws MediaCodecUtil.DecoderQueryException {
        return MediaCodecUtil.getPassthroughDecoderInfo();
    }
}
