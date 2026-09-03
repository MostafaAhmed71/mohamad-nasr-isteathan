package sa.isteathan.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    @PluginMethod
    public void installApk(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("url_required");
            return;
        }

        new Thread(() -> {
            try {
                File apk = downloadApk(url.trim());
                bridge
                    .getActivity()
                    .runOnUiThread(() -> {
                        try {
                            launchInstall(apk);
                            JSObject result = new JSObject();
                            result.put("ok", true);
                            call.resolve(result);
                        } catch (Exception err) {
                            call.reject(err.getMessage() == null ? "install_failed" : err.getMessage());
                        }
                    });
            } catch (Exception err) {
                call.reject(err.getMessage() == null ? "download_failed" : err.getMessage());
            }
        })
            .start();
    }

    private File downloadApk(String urlString) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlString).openConnection();
        connection.setConnectTimeout(30_000);
        connection.setReadTimeout(120_000);
        connection.setInstanceFollowRedirects(true);
        connection.connect();

        int code = connection.getResponseCode();
        if (code < 200 || code >= 300) {
            throw new Exception("download_http_" + code);
        }

        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new Exception("cache_dir_failed");
        }

        File apk = new File(dir, "khurooj-update.apk");
        try (
            InputStream input = connection.getInputStream();
            FileOutputStream output = new FileOutputStream(apk)
        ) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
        } finally {
            connection.disconnect();
        }

        return apk;
    }

    private void launchInstall(File apk) {
        Uri uri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            apk
        );

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                settings.setData(Uri.parse("package:" + getContext().getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settings);
                throw new RuntimeException("install_permission_required");
            }
        }

        getContext().startActivity(intent);
    }
}
