package com.grayxon.caixuntv.apps;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;

import com.grayxon.caixuntv.diagnostics.DiagnosticLog;

/** Launches known Android TV app front doors when installed. */
public final class TvAppLauncher {
    public static final String SPOTIFY = "com.spotify.tv.android";
    public static final String YOUTUBE = "com.google.android.youtube.tv";
    public static final String DISNEY_PLUS = "com.disney.disneyplus";

    private final Context context;
    private final PackageManager packageManager;

    public TvAppLauncher(Context context) {
        this.context = context;
        this.packageManager = context.getPackageManager();
    }

    public String launch(String label, String packageName) {
        try {
            Intent intent = packageManager.getLeanbackLaunchIntentForPackage(packageName);
            if (intent == null) {
                intent = packageManager.getLaunchIntentForPackage(packageName);
            }
            if (intent == null) {
                return DiagnosticLog.info(label + " is not installed or has no launch activity");
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            return DiagnosticLog.info("Launch requested: " + label + " (" + packageName + ")");
        } catch (ActivityNotFoundException | SecurityException error) {
            return DiagnosticLog.error("Could not launch " + label, error);
        }
    }
}
