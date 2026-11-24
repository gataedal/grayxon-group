package com.grayxon.caixuntv.accessibility;
import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.view.accessibility.AccessibilityEvent;
import com.grayxon.caixuntv.diagnostics.DiagnosticLog;
/** Dispatches Android global actions; does not retrieve or inspect screen content. */
public final class CaixunAccessibilityService extends AccessibilityService {
 private static volatile CaixunAccessibilityService active;
 public static boolean isConnected(){return active!=null;}
 static CaixunAccessibilityService getConnectedService(){return active;}
 @Override protected void onServiceConnected(){super.onServiceConnected();active=this;DiagnosticLog.info("Global-control service connected");}
 @Override public void onAccessibilityEvent(AccessibilityEvent event){/* no screen content access */}
 @Override public void onInterrupt(){DiagnosticLog.info("Accessibility service interrupted");}
 @Override public boolean onUnbind(Intent intent){active=null;DiagnosticLog.info("Global-control service disconnected");return super.onUnbind(intent);}
 @Override public void onDestroy(){active=null;super.onDestroy();}
}