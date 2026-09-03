package sa.isteathan.app;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    public static final String EXTRA_OPEN_PATH = "open_path";
    public static final String CLASS_DISPLAY_PATH = "/display/class";

    public static Intent openIntent(Context ctx, String path) {
        Intent launch = new Intent(ctx, MainActivity.class);
        launch.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK |
            Intent.FLAG_ACTIVITY_SINGLE_TOP |
            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        );
        if (path != null && !path.isEmpty()) {
            launch.putExtra(EXTRA_OPEN_PATH, path);
            ctx.getSharedPreferences(BackgroundMonitorService.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString("launchPath", path)
                .apply();
        }
        return launch;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundMonitorPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        stashOpenPath(getIntent());
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().postDelayed(() -> injectOpenPath(getIntent()), 700);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        stashOpenPath(intent);
        injectOpenPath(intent);
    }

    @Override
    public void onPause() {
        super.onPause();
        keepWebViewAlive();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebViewAlive();
    }

    private void stashOpenPath(Intent intent) {
        if (intent == null) return;
        String path = intent.getStringExtra(EXTRA_OPEN_PATH);
        if (path == null || path.isEmpty()) return;
        getSharedPreferences(BackgroundMonitorService.PREFS, MODE_PRIVATE)
            .edit()
            .putString("launchPath", path)
            .apply();
    }

    private void injectOpenPath(Intent intent) {
        if (intent == null || getBridge() == null || getBridge().getWebView() == null) return;
        String path = intent.getStringExtra(EXTRA_OPEN_PATH);
        if (path == null || path.isEmpty()) return;
        intent.removeExtra(EXTRA_OPEN_PATH);
        String escaped = JSONObject.quote(path);
        getBridge().getWebView().postDelayed(() -> {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            getBridge().getWebView().evaluateJavascript(
                "(function(){window.dispatchEvent(new CustomEvent('isteathan:navigate',{detail:" +
                    escaped +
                    "}));})()",
                null
            );
        }, 200);
    }

    private void keepWebViewAlive() {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.onResume();
        webView.resumeTimers();
    }
}
