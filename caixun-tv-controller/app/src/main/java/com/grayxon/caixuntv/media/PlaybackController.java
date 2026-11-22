package com.grayxon.caixuntv.media;

/** Future extension point for MediaSession/NotificationListener based playback control. */
public interface PlaybackController {
    PlaybackState readState();
    boolean play();
    boolean pause();
    boolean stop();

    enum PlaybackState {
        PLAYING,
        PAUSED,
        STOPPED,
        UNKNOWN,
        UNAVAILABLE
    }
}
