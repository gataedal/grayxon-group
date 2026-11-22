package com.grayxon.caixuntv.accessibility;

/**
 * Future extension point for a user-enabled AccessibilityService.
 * No accessibility service or special access is activated in this prototype.
 */
public interface GlobalNavigationController {
    boolean home();
    boolean back();
    boolean dpadUp();
    boolean dpadDown();
    boolean dpadLeft();
    boolean dpadRight();
    boolean dpadCenter();
}
