package com.grayxon.caixuntv.diagnostics;

import android.util.Log;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Small diagnostic helper. Messages are also written to Logcat under CaixunTVController. */
public final class DiagnosticLog {
    private static final String TAG = "CaixunTVController";
    private static final SimpleDateFormat TIME_FORMAT =
            new SimpleDateFormat("HH:mm:ss", Locale.US);

    private DiagnosticLog() { }

    public static String info(String message) {
        String line = timestamp() + "  " + message;
        Log.i(TAG, message);
        return line;
    }

    public static String error(String message, Throwable error) {
        String detail = error == null ? message : message + ": " + error.getClass().getSimpleName()
                + " — " + error.getMessage();
        String line = timestamp() + "  ERROR  " + detail;
        Log.e(TAG, detail, error);
        return line;
    }

    private static String timestamp() {
        return TIME_FORMAT.format(new Date());
    }
}
