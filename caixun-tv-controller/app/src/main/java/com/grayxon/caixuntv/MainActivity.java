package com.grayxon.caixuntv;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.media.AudioManager;

import com.grayxon.caixuntv.accessibility.GlobalNavigationController;
import com.grayxon.caixuntv.apps.TvAppLauncher;
import com.grayxon.caixuntv.control.AudioController;
import com.grayxon.caixuntv.control.PowerStateReader;
import com.grayxon.caixuntv.diagnostics.DiagnosticLog;

public final class MainActivity extends Activity {
 private static final int BG=Color.rgb(10,16,25), CARD=Color.rgb(23,33,48), FOCUS=Color.rgb(33,55,76);
 private static final int CYAN=Color.rgb(72,211,220), WHITE=Color.rgb(245,248,252), MUTED=Color.rgb(174,190,207);
 private AudioController audio; private PowerStateReader power; private TvAppLauncher apps;
 private TextView status,audioStatus,appStatus,controlStatus,diagnostics;

 @Override protected void onCreate(Bundle saved){
  super.onCreate(saved);
  audio=new AudioController((AudioManager)getSystemService(AUDIO_SERVICE));
  power=new PowerStateReader((PowerManager)getSystemService(POWER_SERVICE));
  apps=new TvAppLauncher(this); setContentView(buildUi());
  log(DiagnosticLog.info("Version 0.2.0 started; cloud backend not configured")); refresh();
 }
 @Override protected void onResume(){super.onResume();if(status!=null)refresh();}

 private View buildUi(){
  ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(BG);
  LinearLayout page=new LinearLayout(this);page.setOrientation(LinearLayout.VERTICAL);page.setPadding(dp(44),dp(26),dp(44),dp(32));scroll.addView(page);
  page.addView(label("CAIXUN TV",34,WHITE,true));
  TextView sub=label("CONTROL REMOTO  ·  ANDROID TV",15,MUTED,false);LinearLayout.LayoutParams sp=full();sp.bottomMargin=dp(18);page.addView(sub,sp);
  status=label("",18,WHITE,false);status.setPadding(dp(18),dp(14),dp(18),dp(14));status.setBackground(round(CARD,dp(14)));page.addView(status,full());
  audioStatus=label("",16,MUTED,false);page.addView(audioStatus,full());

  section(page,"Volumen");
  LinearLayout volume=row();
  volume.addView(button("−  Bajar",()->act("volume-down",()->audio.adjustVolume(false))),weighted());
  volume.addView(button("+  Subir",()->act("volume-up",()->audio.adjustVolume(true))),weighted());
  volume.addView(button("Silenciar",()->act("mute",()->audio.setMuted(true))),weighted());
  volume.addView(button("Activar sonido",()->act("unmute",()->audio.setMuted(false))),weighted());page.addView(volume);

  section(page,"Navegación");
  page.addView(label("El control físico mueve el foco. Para enviar D-pad globalmente, habilita el servicio opcional de Accesibilidad.",15,MUTED,false),full());
  LinearLayout up=row();up.addView(new View(this),weighted());up.addView(button("▲",()->nav(GlobalNavigationController.Action.UP)),weighted());up.addView(new View(this),weighted());page.addView(up);
  LinearLayout mid=row();mid.addView(button("◀",()->nav(GlobalNavigationController.Action.LEFT)),weighted());
  mid.addView(button("●  Seleccionar",()->nav(GlobalNavigationController.Action.SELECT)),weighted());
  mid.addView(button("▶",()->nav(GlobalNavigationController.Action.RIGHT)),weighted());page.addView(mid);
  LinearLayout down=row();down.addView(new View(this),weighted());down.addView(button("▼",()->nav(GlobalNavigationController.Action.DOWN)),weighted());down.addView(new View(this),weighted());page.addView(down);
  LinearLayout system=row();system.addView(button("⌂  Inicio",()->nav(GlobalNavigationController.Action.HOME)),weighted());
  system.addView(button("←  Atrás",()->nav(GlobalNavigationController.Action.BACK)),weighted());page.addView(system);

  section(page,"Aplicaciones");
  LinearLayout appsRow=row();
  appsRow.addView(button("Spotify",()->act("Spotify",()->apps.launch("Spotify",TvAppLauncher.SPOTIFY))),weighted());
  appsRow.addView(button("YouTube",()->act("YouTube",()->apps.launch("YouTube",TvAppLauncher.YOUTUBE))),weighted());
  appsRow.addView(button("Disney+",()->act("Disney+",()->apps.launch("Disney+",TvAppLauncher.DISNEY_PLUS))),weighted());page.addView(appsRow);
  appStatus=label("",15,MUTED,false);page.addView(appStatus,full());

  section(page,"Diagnóstico");
  controlStatus=label("",16,WHITE,false);controlStatus.setPadding(dp(14),dp(12),dp(14),dp(12));controlStatus.setBackground(round(CARD,dp(12)));page.addView(controlStatus,full());
  LinearLayout diagRow=row();
  diagRow.addView(button("Configurar control global",this::openAccessibility),weighted());
  diagRow.addView(button("Actualizar estado",()->act("diagnostics-refresh",()->{refresh();return DiagnosticLog.info("Diagnostics refreshed");})),weighted());page.addView(diagRow);
  diagnostics=label("",13,MUTED,false);diagnostics.setPadding(dp(14),dp(10),dp(14),dp(10));diagnostics.setBackground(round(CARD,dp(12)));page.addView(diagnostics,full());
  return scroll;
 }

 private void refresh(){
  AudioController.AudioState a=audio.readState();boolean interactive=power.isInteractive(),global=GlobalNavigationController.isAvailable();
  String net=networkStatus();
  status.setText((interactive?"● Interactiva":"● No interactiva / reposo")+"    ·    Red: "+net);
  audioStatus.setText("Volumen "+a.volume+"/"+a.maximum+" ("+a.toPercent()+"%)    ·    Silencio "+(a.muted?"sí":"no")+"    ·    Fijo "+(a.fixedVolumePolicy?"sí":"no"));
  controlStatus.setText("Acciones globales: "+(global?"listas":"Accesibilidad requiere activación manual")+"\nBackend remoto: aún no configurado");
  appStatus.setText("Spotify "+availability(TvAppLauncher.SPOTIFY)+"   ·   YouTube "+availability(TvAppLauncher.YOUTUBE)+"   ·   Disney+ "+availability(TvAppLauncher.DISNEY_PLUS));
  log(DiagnosticLog.info("Status interactive="+interactive+", network="+net+", globalControl="+global+", audio="+a.volume+"/"+a.maximum+", muted="+a.muted));
 }
 private String networkStatus(){
  try{ConnectivityManager cm=(ConnectivityManager)getSystemService(Context.CONNECTIVITY_SERVICE);Network n=cm==null?null:cm.getActiveNetwork();
   NetworkCapabilities c=n==null?null:cm.getNetworkCapabilities(n);
   if(c==null||!c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET))return "sin conexión";
   return c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)?"Internet disponible":"red no validada";
  }catch(RuntimeException e){log(DiagnosticLog.error("Network diagnosis failed",e));return "no disponible";}
 }
 private String availability(String pkg){return apps.isInstalled(pkg)?"instalada":"no detectada";}
 private void openAccessibility(){
  try{startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));log(DiagnosticLog.info("Opened Accessibility settings; opt-in is manual"));}
  catch(RuntimeException e){log(DiagnosticLog.error("Could not open Accessibility settings",e));}
 }
 private void nav(GlobalNavigationController.Action a){act("navigation-"+a.name(),()->GlobalNavigationController.execute(a));}
 private void act(String label,Action action){try{log(action.run());refresh();}catch(RuntimeException e){log(DiagnosticLog.error("Action failed: "+label,e));}}
 private void log(String line){
  if(diagnostics==null||line==null)return;String joined=diagnostics.getText().length()==0?line:diagnostics.getText()+"\n"+line;
  String[] rows=joined.split("\n");StringBuilder b=new StringBuilder();
  for(int i=Math.max(0,rows.length-16);i<rows.length;i++){if(b.length()>0)b.append('\n');b.append(rows[i]);}diagnostics.setText(b.toString());
 }
 private TextView label(String text,int size,int color,boolean bold){
  TextView v=new TextView(this);v.setText(text);v.setTextColor(color);v.setTextSize(TypedValue.COMPLEX_UNIT_SP,size);v.setGravity(Gravity.CENTER_VERTICAL);
  if(bold)v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return v;
 }
 private void section(LinearLayout p,String text){TextView t=label(text,21,CYAN,true);t.setPadding(0,dp(18),0,dp(5));p.addView(t);}
 private LinearLayout row(){LinearLayout r=new LinearLayout(this);r.setOrientation(LinearLayout.HORIZONTAL);r.setGravity(Gravity.CENTER_VERTICAL);return r;}
 private Button button(String text,Runnable action){
  Button b=new Button(this);b.setText(text);b.setTextColor(WHITE);b.setTextSize(TypedValue.COMPLEX_UNIT_SP,17);b.setAllCaps(false);b.setMinHeight(dp(58));b.setFocusable(true);
  StateListDrawable states=new StateListDrawable();states.addState(new int[]{android.R.attr.state_focused},round(FOCUS,dp(12),CYAN,dp(2)));
  states.addState(new int[]{android.R.attr.state_pressed},round(FOCUS,dp(12),CYAN,dp(1)));states.addState(new int[]{},round(CARD,dp(12)));
  b.setBackground(states);b.setOnClickListener(v->action.run());return b;
 }
 private GradientDrawable round(int color,int radius){return round(color,radius,Color.TRANSPARENT,0);}
 private GradientDrawable round(int color,int radius,int stroke,int width){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(radius);if(width>0)d.setStroke(width,stroke);return d;}
 private LinearLayout.LayoutParams full(){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,dp(4),0,dp(4));return p;}
 private LinearLayout.LayoutParams weighted(){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);p.setMargins(dp(3),dp(4),dp(5),dp(4));return p;}
 private int dp(int x){return Math.round(x*getResources().getDisplayMetrics().density);}
 private interface Action{String run();}
}