package com.grayxon.caixuntv.control;

import android.media.AudioManager;

import com.grayxon.caixuntv.diagnostics.DiagnosticLog;

/** Uses Android's public AudioManager APIs for the TV's music stream. */
public final class AudioController {
    private final AudioManager audioManager;

    public AudioController(AudioManager audioManager) {
        this.audioManager = audioManager;
    }

    public AudioState readState() {
        int current = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
        int maximum = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        boolean muted = audioManager.isStreamMute(AudioManager.STREAM_MUSIC);
        boolean fixed = audioManager.isVolumeFixed();
        DiagnosticLog.info("Audio state: volume=" + current + "/" + maximum
                + ", muted=" + muted + ", fixed=" + fixed);
        return new AudioState(current, maximum, muted, fixed);
    }

    public String setVolume(int requestedLevel) {
        int maximum = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        int level = Math.max(0, Math.min(requestedLevel, maximum));
        audioManager.setStreamVolume(
                AudioManager.STREAM_MUSIC,
                level,
                AudioManager.FLAG_SHOW_UI
        );
        AudioState state = readState();
        return DiagnosticLog.info("Set volume requested=" + requestedLevel
                + ", applied=" + state.volume + "/" + state.maximum);
    }

    public String adjustVolume(boolean raise) {
        audioManager.adjustStreamVolume(
                AudioManager.STREAM_MUSIC,
                raise ? AudioManager.ADJUST_RAISE : AudioManager.ADJUST_LOWER,
                AudioManager.FLAG_SHOW_UI
        );
        AudioState state = readState();
        return DiagnosticLog.info("Adjusted volume " + (raise ? "up" : "down")
                + "; now " + state.volume + "/" + state.maximum);
    }

    public String setMuted(boolean muted) {
        audioManager.adjustStreamVolume(
                AudioManager.STREAM_MUSIC,
                muted ? AudioManager.ADJUST_MUTE : AudioManager.ADJUST_UNMUTE,
                AudioManager.FLAG_SHOW_UI
        );
        AudioState state = readState();
        return DiagnosticLog.info("Set mute requested=" + muted + ", observed=" + state.muted);
    }

    public static final class AudioState {
        public final int volume;
        public final int maximum;
        public final boolean muted;
        public final boolean fixedVolumePolicy;

        AudioState(int volume, int maximum, boolean muted, boolean fixedVolumePolicy) {
            this.volume = volume;
            this.maximum = maximum;
            this.muted = muted;
            this.fixedVolumePolicy = fixedVolumePolicy;
        }

        public int toPercent() {
            return maximum <= 0 ? 0 : Math.round((volume * 100f) / maximum);
        }
    }
}
