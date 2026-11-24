package com.grayxon.caixuntv.apps;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import com.grayxon.caixuntv.diagnostics.DiagnosticLog;
/** Launches known TV app front doors when installed and visible to package queries. */
public final class TvAppLauncher {
 public static final String SPOTIFY="com.spotify.tv.android", YOUTUBE="com.google.android.youtube.tv", DISNEY_PLUS="com.disney.disneyplus";
 private final Context context; private final PackageManager pm;
 public TvAppLauncher(Context c){context=c;pm=c.getPackageManager();}
 public boolean isInstalled(String pkg){try{return pm.getApplicationInfo(pkg,0).enabled;}catch(PackageManager.NameNotFoundException|SecurityException e){return false;}}
 public String launch(String label,String pkg){
  try {Intent i=pm.getLeanbackLaunchIntentForPackage(pkg);if(i==null)i=pm.getLaunchIntentForPackage(pkg);
   if(i==null)return DiagnosticLog.info(label+" is not installed or has no launch activity");
   i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);context.startActivity(i);return DiagnosticLog.info("Launch requested: "+label+" ("+pkg+")");
  }catch(ActivityNotFoundException|SecurityException e){return DiagnosticLog.error("Could not launch "+label,e);}
 }
}