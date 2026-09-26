package com.paddy.paddyprice;

import android.content.ContentValues;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.io.File;
import java.io.FileOutputStream;

/**
 * GallerySave plugin — writes a PNG image (base64) into the Android Gallery.
 *
 * Modern Android (API 29+, scoped storage): inserts into
 * MediaStore.Images under Pictures/Paddy — visible in Photos/Gallery with
 * NO storage permission required.
 *
 * Legacy Android (API 24–28): writes to the public Pictures/Paddy directory
 * and triggers a media scan so the Gallery picks it up. Requires
 * WRITE_EXTERNAL_STORAGE (declared with maxSdkVersion=28 in the manifest).
 *
 * Ported to match the existing DeviceAuthPlugin pattern (same package,
 * @CapacitorPlugin, PluginCall/JSObject).
 */
@CapacitorPlugin(name = "GallerySave")
public class GallerySavePlugin extends Plugin {

    private static final String RELATIVE_PATH = Environment.DIRECTORY_PICTURES + "/Paddy";

    @PluginMethod
    public void save(PluginCall call) {
        String fileName = call.getString("fileName");
        String dataBase64 = call.getString("dataBase64");
        if (fileName == null || fileName.isEmpty()) {
            call.reject("fileName is required");
            return;
        }
        if (dataBase64 == null || dataBase64.isEmpty()) {
            call.reject("dataBase64 is required");
            return;
        }
        try {
            byte[] bytes = Base64.decode(dataBase64, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) {
                call.reject("invalid PNG data");
                return;
            }
            Uri uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                uri = saveModern(fileName, bitmap);
            } else {
                uri = saveLegacy(fileName, bitmap);
            }
            bitmap.recycle();
            JSObject out = new JSObject();
            out.put("path", uri != null ? uri.toString() : "");
            call.resolve(out);
        } catch (Exception e) {
            call.reject("failed to save image: " + e.getMessage(), e);
        }
    }

    /**
     * Save a PDF document (base64) into the public Downloads/Paddy folder.
     *
     * Modern Android (API 29+, scoped storage): inserts into
     * MediaStore.Downloads under Download/Paddy — NO storage permission
     * required. This is the scoped-storage-compatible replacement for the
     * previous direct write into the public Documents directory, which
     * fails with EACCES on Android 10+.
     *
     * Legacy Android (API 24–28): writes to the public Downloads/Paddy
     * directory and triggers a media scan. Covered by the already-declared
     * WRITE_EXTERNAL_STORAGE (maxSdkVersion=28) manifest permission.
     *
     * `relativePath` is the sanitized document relative path (e.g.
     * "voucher/PSO1-20260926-0001-U Shwe.pdf"); the last segment becomes
     * the display name and any preceding segments become sub-folders
     * under Download/Paddy.
     */
    @PluginMethod
    public void savePdf(PluginCall call) {
        String relativePath = call.getString("relativePath");
        String dataBase64 = call.getString("dataBase64");
        if (relativePath == null || relativePath.isEmpty()) {
            call.reject("relativePath is required");
            return;
        }
        if (dataBase64 == null || dataBase64.isEmpty()) {
            call.reject("dataBase64 is required");
            return;
        }
        try {
            byte[] bytes = Base64.decode(dataBase64, Base64.DEFAULT);
            String[] parts = relativePath.split("/");
            String fileName = parts[parts.length - 1];
            if (!fileName.toLowerCase().endsWith(".pdf")) {
                fileName = fileName + ".pdf";
            }
            StringBuilder subDir = new StringBuilder();
            for (int i = 0; i < parts.length - 1; i++) {
                if (!parts[i].isEmpty() && !".".equals(parts[i]) && !"..".equals(parts[i])) {
                    if (subDir.length() > 0) {
                        subDir.append('/');
                    }
                    subDir.append(parts[i]);
                }
            }
            Uri uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                uri = savePdfModern(fileName, subDir.toString(), bytes);
            } else {
                uri = savePdfLegacy(fileName, subDir.toString(), bytes);
            }
            JSObject out = new JSObject();
            out.put("path", uri != null ? uri.toString() : "");
            call.resolve(out);
        } catch (Exception e) {
            call.reject("failed to save pdf: " + e.getMessage(), e);
        }
    }

    /** API 29+ — MediaStore insert under Pictures/Paddy (scoped storage, no permission). */
    private Uri saveModern(String fileName, Bitmap bitmap) throws Exception {
        if (!fileName.toLowerCase().endsWith(".png")) {
            fileName = fileName + ".png";
        }
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
        values.put(MediaStore.Images.Media.RELATIVE_PATH, RELATIVE_PATH);
        values.put(MediaStore.Images.Media.IS_PENDING, 1);

        Uri collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        Uri item = getContext().getContentResolver().insert(collection, values);
        if (item == null) {
            throw new Exception("MediaStore insert returned null");
        }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(item)) {
            if (out == null) {
                throw new Exception("could not open output stream");
            }
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        }
        values.clear();
        values.put(MediaStore.Images.Media.IS_PENDING, 0);
        getContext().getContentResolver().update(item, values, null, null);
        return item;
    }

    /** API 24–28 — write to public Pictures/Paddy + media scan. */
    private Uri saveLegacy(String fileName, Bitmap bitmap) throws Exception {
        if (!fileName.toLowerCase().endsWith(".png")) {
            fileName = fileName + ".png";
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(
            Environment.DIRECTORY_PICTURES), "Paddy");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new Exception("could not create directory: " + dir.getAbsolutePath());
        }
        File file = new File(dir, fileName);
        try (FileOutputStream fos = new FileOutputStream(file)) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, fos);
            fos.flush();
        }
        // Trigger a media scan so the Gallery shows the new image immediately.
        Uri uri = Uri.fromFile(file);
        try {
            android.media.MediaScannerConnection.scanFile(
                getContext(),
                new String[]{file.getAbsolutePath()},
                new String[]{"image/png"},
                null);
        } catch (Exception ignored) {
            // Media scan is best-effort; the file is already on disk.
        }
        return uri;
    }

    /** API 29+ — MediaStore.Downloads insert under Download/Paddy[/subdir] (scoped storage, no permission). */
    private Uri savePdfModern(String fileName, String subDir, byte[] bytes) throws Exception {
        String relativePath = Environment.DIRECTORY_DOWNLOADS + "/Paddy"
            + (subDir.isEmpty() ? "" : "/" + subDir);
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
        values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
        values.put(MediaStore.Downloads.RELATIVE_PATH, relativePath);
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        Uri item = getContext().getContentResolver().insert(collection, values);
        if (item == null) {
            throw new Exception("MediaStore insert returned null");
        }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(item)) {
            if (out == null) {
                throw new Exception("could not open output stream");
            }
            out.write(bytes);
            out.flush();
        }
        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        getContext().getContentResolver().update(item, values, null, null);
        return item;
    }

    /** API 24–28 — write to public Downloads/Paddy[/subdir] + media scan. */
    private Uri savePdfLegacy(String fileName, String subDir, byte[] bytes) throws Exception {
        File dir = new File(Environment.getExternalStoragePublicDirectory(
            Environment.DIRECTORY_DOWNLOADS), "Paddy" + (subDir.isEmpty() ? "" : "/" + subDir));
        if (!dir.exists() && !dir.mkdirs()) {
            throw new Exception("could not create directory: " + dir.getAbsolutePath());
        }
        File file = new File(dir, fileName);
        try (FileOutputStream fos = new FileOutputStream(file)) {
            fos.write(bytes);
            fos.flush();
        }
        // Trigger a media scan so Files/Docs apps show the new PDF immediately.
        Uri uri = Uri.fromFile(file);
        try {
            android.media.MediaScannerConnection.scanFile(
                getContext(),
                new String[]{file.getAbsolutePath()},
                new String[]{"application/pdf"},
                null);
        } catch (Exception ignored) {
            // Media scan is best-effort; the file is already on disk.
        }
        return uri;
    }
}
