package com.grayxon.caixuntv;

import android.app.Activity;
import android.graphics.Color;
import android.media.AudioManager;
import android.os.Bundle;
import android.os.PowerManager;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import com.grayxon.caixuntv.accessibility.GlobalNavigationController;
import com.grayxon.caixuntv.apps.TvAppLauncher;
import com.grayxon.caixuntv.backend.CommandTransport;
import com.grayxon.caixuntv.control.AudioController;
import com.grayxon.caixuntv.control.PowerStateReader;
import com.grayxon.caixuntv.diagnostics.DiagnosticLog;
import com.grayxon.caixuntv.media.PlaybackController;

public final class MainActivity extends Activity {
    private static final int COLOR_BACKGROUND = Color.rgb(16, 24, 32);
    private static final int COLOR_SURFACE = Color.rgb(27, 42, 54);
    private static final int COLOR_ACCENT = Color.rgb(53, 198, 208);
    private static final int COLOR_TEXT = Color.rgb(243, 247, 250);
    private static final int COLOR_MUTED = Color.rgb(175, 192, 204);

    private AudioController audioController;
    private PowerStateReader powerStateReader;
    private TvAppLauncher appLauncher;
    private TextView statusText;
    private TextView volumeText;
    private TextView diagnosticText;
    private SeekBar volumeSeekBar;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        AudioManager audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        audioController = new AudioController(audioManager);
        powerStateReader = new PowerStateReader(powerManager);
        appLauncher = new TvAppLauncher(this);

        setContentView(buildInterface());
        appendLog(DiagnosticLog.info("Prototype started; no backend or special-access service is active"));
        refreshStatus();
    }

    private View buildInterface() {
        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(COLOR_BACKGROUND);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(40), dp(28), dp(40), dp(32));
        scrollView.addView(content);

        TextView title = new TextView(this);
        title.setText(R.string.screen_title);
        title.setTextColor(COLOR_TEXT);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 32);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        content.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText(R.string.screen_subtitle);
        subtitle.setTextColor(COLOR_MUTED);
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        subtitleParams.bottomMargin = dp(18);
        content.addView(subtitle, subtitleParams);

        statusText = new TextView(this);
        statusText.setTextColor(COLOR_TEXT);
        statusText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        statusText.setPadding(dp(18), dp(14), dp(18), dp(14));
        statusText.setBackgroundColor(COLOR_SURFACE);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        statusParams.bottomMargin = dp(18);
        content.addView(statusText, statusParams);

        addSectionTitle(content, "Volumen");
        volumeText = new TextView(this);
        volumeText.setTextColor(COLOR_TEXT);
        volumeText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        content.addView(volumeText);

        volumeSeekBar = new SeekBar(this);
        volumeSeekBar.setMax(Math.max(1, audioController.readState().maximum));
        volumeSeekBar.setFocusable(true);
        volumeSeekBar.setContentDescription("Nivel de volumen");
        volumeSeekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                volumeText.setText("Nivel: " + progress + " de " + seekBar.getMax());
            }

            @Override
            public void onStartTrackingTouch(SeekBar seekBar) { }

            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {
                runAction(() -> audioController.setVolume(seekBar.getProgress()));
            }
        });
        content.addView(volumeSeekBar, fullWidthParams());

        LinearLayout volumeRow = row();
        volumeRow.addView(makeButton("Volumen −", () -> runAction(() -> audioController.adjustVolume(false))), weightParams());
        volumeRow.addView(makeButton("Volumen +", () -> runAction(() -> audioController.adjustVolume(true))), weightParams());
        content.addView(volumeRow);

        LinearLayout muteRow = row();
        muteRow.addView(makeButton("Silenciar", () -> runAction(() -> audioController.setMuted(true))), weightParams());
        muteRow.addView(makeButton("Activar sonido", () -> runAction(() -> audioController.setMuted(false))), weightParams());
        content.addView(muteRow);

        addSectionTitle(content, "Aplicaciones instaladas");
        LinearLayout appRow = row();
        appRow.addView(makeButton("Spotify", () -> runAction(() -> appLauncher.launch("Spotify", TvAppLauncher.SPOTIFY))), weightParams());
        appRow.addView(makeButton("YouTube", () -> runAction(() -> appLauncher.launch("YouTube", TvAppLauncher.YOUTUBE))), weightParams());
        appRow.addView(makeButton("Disney+", () -> runAction(() -> appLauncher.launch("Disney+", TvAppLauncher.DISNEY_PLUS))), weightParams());
        content.addView(appRow);

        addSectionTitle(content, "Diagnóstico");
        content.addView(makeButton("Actualizar estado", () -> runAction(() -> {
            refreshStatus();
            return DiagnosticLog.info("Status refreshed");
        })), fullWidthParams());
        diagnosticText = new TextView(this);
        diagnosticText.setTextColor(COLOR_MUTED);
        diagnosticText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        diagnosticText.setPadding(dp(14), dp(10), dp(14), dp(10));
        diagnosticText.setBackgroundColor(COLOR_SURFACE);
        content.addView(diagnosticText, fullWidthParams());

        return scrollView;
    }

    private void refreshStatus() {
        AudioController.AudioState audio = audioController.readState();
        boolean interactive = powerStateReader.isInteractive();
        statusText.setText("Estado de Android: " + (interactive ? "interactivo" : "no interactivo")
                + "\nSilencio: " + (audio.muted ? "activado" : "desactivado")
                + "\nPolítica de volumen fijo: " + (audio.fixedVolumePolicy ? "sí" : "no"));
        volumeSeekBar.setMax(Math.max(1, audio.maximum));
        volumeSeekBar.setProgress(Math.min(audio.volume, volumeSeekBar.getMax()));
        volumeText.setText("Nivel: " + audio.volume + " de " + audio.maximum
                + " (" + audio.toPercent() + "%)");
        appendLog(DiagnosticLog.info("Refresh complete: interactive=" + interactive
                + ", volume=" + audio.volume + "/" + audio.maximum + ", muted=" + audio.muted));
    }

    private void runAction(Action action) {
        try {
            String result = action.run();
            appendLog(result);
            refreshStatus();
        } catch (RuntimeException error) {
            appendLog(DiagnosticLog.error("Action failed", error));
        }
    }

    private void appendLog(String message) {
        if (diagnosticText == null || message == null) return;
        String oldText = diagnosticText.getText().toString();
        String combined = oldText.isEmpty() ? message : oldText + "\n" + message;
        String[] lines = combined.split("\n");
        StringBuilder recent = new StringBuilder();
        int start = Math.max(0, lines.length - 18);
        for (int i = start; i < lines.length; i++) {
            if (recent.length() > 0) recent.append('\n');
            recent.append(lines[i]);
        }
        diagnosticText.setText(recent.toString());
    }

    private void addSectionTitle(LinearLayout parent, String text) {
        TextView section = new TextView(this);
        section.setText(text);
        section.setTextColor(COLOR_ACCENT);
        section.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        section.setTypeface(null, android.graphics.Typeface.BOLD);
        section.setPadding(0, dp(18), 0, dp(6));
        parent.addView(section);
    }

    private LinearLayout row() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        return row;
    }

    private Button makeButton(String text, Runnable action) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextColor(COLOR_TEXT);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        button.setAllCaps(false);
        button.setMinHeight(dp(62));
        button.setFocusable(true);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(COLOR_SURFACE));
        button.setOnClickListener(view -> action.run());
        return button;
    }

    private LinearLayout.LayoutParams weightParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        params.setMargins(0, dp(4), dp(8), dp(4));
        return params;
    }

    private LinearLayout.LayoutParams fullWidthParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, dp(4), 0, dp(4));
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private interface Action {
        String run();
    }
}
