package com.grayxon.caixuntv.control;

import android.os.PowerManager;

import com.grayxon.caixuntv.diagnostics.DiagnosticLog;

/** Reads Android's interactive state; this is not a hardware power-switch status. */
public final class PowerStateReader {
    private final PowerManager powerManager;

    public PowerStateReader(PowerManager powerManager) {
        this.powerManager = powerManager;
    }

    public boolean isInteractive() {
        boolean interactive = powerManager.isInteractive();
        DiagnosticLog.info("PowerManager.isInteractive=" + interactive);
        return interactive;
    }
}
