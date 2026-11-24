package com.grayxon.caixuntv.accessibility;
import android.accessibilityservice.AccessibilityService;
import android.os.Build;
import com.grayxon.caixuntv.diagnostics.DiagnosticLog;
/** Global commands are available only after the user enables the accessibility service. */
public final class GlobalNavigationController {
 public enum Action { HOME, BACK, UP, DOWN, LEFT, RIGHT, SELECT }
 private GlobalNavigationController() {}
 public static boolean isAvailable() { return CaixunAccessibilityService.isConnected(); }
 public static String execute(Action action) {
  CaixunAccessibilityService service=CaixunAccessibilityService.getConnectedService();
  if(service==null) return DiagnosticLog.info("Global control unavailable: enable the optional Accessibility service");
  int id;
  switch(action) {
   case HOME: id=AccessibilityService.GLOBAL_ACTION_HOME; break;
   case BACK: id=AccessibilityService.GLOBAL_ACTION_BACK; break;
   case UP: if(Build.VERSION.SDK_INT<33)return DiagnosticLog.info("Global D-pad requires API 33+"); id=AccessibilityService.GLOBAL_ACTION_DPAD_UP; break;
   case DOWN: if(Build.VERSION.SDK_INT<33)return DiagnosticLog.info("Global D-pad requires API 33+"); id=AccessibilityService.GLOBAL_ACTION_DPAD_DOWN; break;
   case LEFT: if(Build.VERSION.SDK_INT<33)return DiagnosticLog.info("Global D-pad requires API 33+"); id=AccessibilityService.GLOBAL_ACTION_DPAD_LEFT; break;
   case RIGHT: if(Build.VERSION.SDK_INT<33)return DiagnosticLog.info("Global D-pad requires API 33+"); id=AccessibilityService.GLOBAL_ACTION_DPAD_RIGHT; break;
   case SELECT: if(Build.VERSION.SDK_INT<33)return DiagnosticLog.info("Global D-pad requires API 33+"); id=AccessibilityService.GLOBAL_ACTION_DPAD_CENTER; break;
   default: return DiagnosticLog.info("Unsupported global action");
  }
  return DiagnosticLog.info("Global action "+action+(service.performGlobalAction(id)?" dispatched":" rejected"));
 }
}