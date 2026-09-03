package sa.isteathan.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

public class BackgroundMonitorService extends Service {
    public static final String PREFS = "background_monitor";
    public static final String CHANNEL_MONITOR = "isteathan-monitor";
    public static final String CHANNEL_ALERTS = "isteathan-alerts";
    private static final int MONITOR_ID = 7101;
    private static final long INTERVAL_MS = 8000L;

    private HandlerThread worker;
    private Handler handler;
    private PowerManager.WakeLock wakeLock;
    private RequestOverlay overlay;
    private boolean primed = false;
    private final Set<String> knownPending = new HashSet<>();
    private final Map<String, String> knownStatuses = new HashMap<>();

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            try {
                pollOnce();
            } catch (Exception err) {
                android.util.Log.w("IsteathanMonitor", "poll failed", err);
            }
            if (handler != null) {
                handler.postDelayed(this, INTERVAL_MS);
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
        startAsForeground();
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "isteathan:monitor");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
        }
        overlay = new RequestOverlay(this);
        worker = new HandlerThread("isteathan-monitor");
        worker.start();
        handler = new Handler(worker.getLooper());
        handler.post(tick);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startAsForeground();
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        if (handler != null) handler.removeCallbacksAndMessages(null);
        if (worker != null) worker.quitSafely();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (overlay != null) overlay.hide();
        stopForeground(true);
        super.onDestroy();
    }

    private void startAsForeground() {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_MONITOR)
            .setContentTitle(getString(R.string.monitor_title))
            .setContentText(getString(R.string.monitor_text))
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openAppIntent(staffDisplayPath()))
            .build();
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(
                    MONITOR_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                );
            } else {
                startForeground(MONITOR_ID, notification);
            }
        } catch (Exception first) {
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    startForeground(
                        MONITOR_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                    );
                } else {
                    startForeground(MONITOR_ID, notification);
                }
            } catch (Exception ignored) {
                startForeground(MONITOR_ID, notification);
            }
        }
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;

        NotificationChannel monitor = new NotificationChannel(
            CHANNEL_MONITOR,
            getString(R.string.monitor_channel),
            NotificationManager.IMPORTANCE_LOW
        );
        monitor.setDescription(getString(R.string.monitor_text));
        monitor.setShowBadge(false);

        NotificationChannel alerts = new NotificationChannel(
            CHANNEL_ALERTS,
            getString(R.string.alerts_channel),
            NotificationManager.IMPORTANCE_HIGH
        );
        alerts.enableVibration(true);
        alerts.setDescription(getString(R.string.alerts_channel));

        nm.createNotificationChannel(monitor);
        nm.createNotificationChannel(alerts);
    }

    private String staffDisplayPath() {
        String role = getSharedPreferences(PREFS, MODE_PRIVATE).getString("role", "");
        return "CLASS_STAFF".equals(role) ? MainActivity.CLASS_DISPLAY_PATH : "";
    }

    private PendingIntent openAppIntent(String path) {
        Intent launch = MainActivity.openIntent(this, path);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        int requestCode = path == null ? 0 : path.hashCode();
        return PendingIntent.getActivity(this, requestCode, launch, flags);
    }

    private void pollOnce() throws Exception {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (!prefs.getBoolean("enabled", false)) {
            stopSelf();
            return;
        }

        String role = prefs.getString("role", "");
        String classId = prefs.getString("classId", "");
        String userId = prefs.getString("userId", "");
        if ("CLASS_STAFF".equals(role) && classId.isEmpty()) return;
        if (!"CLASS_STAFF".equals(role)) return;

        JSONArray rows = fetchRequests(prefs, classId);
        if (rows == null) return;

        handleStaff(rows);
        primed = true;
    }

    private void handleStaff(JSONArray rows) throws Exception {
        Set<String> current = new HashSet<>();
        List<String> names = new ArrayList<>();
        boolean fresh = false;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.getJSONObject(i);
            String id = row.optString("id", "");
            if (id.isEmpty()) continue;
            current.add(id);
            names.add(studentName(row));
            if (primed && !knownPending.contains(id)) {
                fresh = true;
                showAlert(
                    getString(R.string.alert_new_title),
                    getString(R.string.alert_new_body, studentName(row)),
                    id.hashCode()
                );
            }
        }
        knownPending.clear();
        knownPending.addAll(current);
        if (overlay != null) overlay.show(names, fresh);
    }

    private String studentName(JSONObject row) {
        Object students = row.opt("students");
        if (students instanceof JSONObject) {
            String name = ((JSONObject) students).optString("full_name", "");
            if (!name.isEmpty()) return name;
        } else if (students instanceof JSONArray && ((JSONArray) students).length() > 0) {
            JSONObject first = ((JSONArray) students).optJSONObject(0);
            if (first != null) {
                String name = first.optString("full_name", "");
                if (!name.isEmpty()) return name;
            }
        }
        return getString(R.string.alert_student_fallback);
    }

    private void showAlert(String title, String body, int id) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ALERTS)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent(MainActivity.CLASS_DISPLAY_PATH))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build();
        nm.notify(Math.abs(id == Integer.MIN_VALUE ? 1 : id), notification);
    }

    private JSONArray fetchRequests(
        SharedPreferences prefs,
        String classId
    ) throws Exception {
        String base = stripSlash(prefs.getString("supabaseUrl", ""));
        String anon = prefs.getString("anonKey", "");
        String access = prefs.getString("accessToken", "");
        if (base.isEmpty() || anon.isEmpty() || access.isEmpty()) return null;

        String filter = "class_id=eq." + enc(classId) + "&status=eq.PENDING";
        String url =
            base +
            "/rest/v1/permission_requests?select=id,status,student_id,students(full_name)&" +
            filter +
            "&order=created_at.desc&limit=40";

        HttpResult result = http("GET", url, anon, access, null);
        if (result.code == 401) {
            if (!refreshSession(prefs, base, anon)) return null;
            access = prefs.getString("accessToken", "");
            result = http("GET", url, anon, access, null);
        }
        if (result.code < 200 || result.code >= 300) {
            android.util.Log.w("IsteathanMonitor", "HTTP " + result.code + " " + result.body);
            return null;
        }
        return new JSONArray(result.body);
    }

    private boolean refreshSession(SharedPreferences prefs, String base, String anon) throws Exception {
        String refresh = prefs.getString("refreshToken", "");
        if (refresh.isEmpty()) return false;
        String url = base + "/auth/v1/token?grant_type=refresh_token";
        JSONObject body = new JSONObject();
        body.put("refresh_token", refresh);
        HttpResult result = http("POST", url, anon, anon, body.toString());
        if (result.code < 200 || result.code >= 300) return false;
        JSONObject json = new JSONObject(result.body);
        String access = json.optString("access_token", "");
        String nextRefresh = json.optString("refresh_token", refresh);
        if (access.isEmpty()) return false;
        prefs.edit()
            .putString("accessToken", access)
            .putString("refreshToken", nextRefresh)
            .apply();
        return true;
    }

    private HttpResult http(
        String method,
        String url,
        String apikey,
        String bearer,
        String jsonBody
    ) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(15000);
        conn.setRequestMethod(method);
        conn.setRequestProperty("apikey", apikey);
        conn.setRequestProperty("Authorization", "Bearer " + bearer);
        conn.setRequestProperty("Accept", "application/json");
        if (jsonBody != null) {
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            byte[] bytes = jsonBody.getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(bytes.length);
            OutputStream os = conn.getOutputStream();
            os.write(bytes);
            os.close();
        }
        int code = conn.getResponseCode();
        InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        String body = readStream(stream);
        conn.disconnect();
        return new HttpResult(code, body);
    }

    private static String readStream(InputStream stream) throws Exception {
        if (stream == null) return "";
        BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line);
        reader.close();
        return sb.toString();
    }

    private static String stripSlash(String value) {
        if (value.endsWith("/")) return value.substring(0, value.length() - 1);
        return value;
    }

    private static String enc(String value) throws Exception {
        return URLEncoder.encode(value, "UTF-8");
    }

    private static class HttpResult {
        final int code;
        final String body;

        HttpResult(int code, String body) {
            this.code = code;
            this.body = body;
        }
    }
}
