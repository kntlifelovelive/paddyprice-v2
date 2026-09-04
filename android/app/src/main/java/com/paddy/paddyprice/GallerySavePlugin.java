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
}
