package com.agpay.usb;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Log;

public class UsbReceiver extends BroadcastReceiver {
  public static final String TAG = "AGPAY_USB";
  public static final String ACTION_USB_PERMISSION = "com.agpay.USB_PERMISSION";

  @Override
  public void onReceive(Context context, Intent intent) {
    String action = intent.getAction();
    UsbManager usbManager = (UsbManager) context.getSystemService(Context.USB_SERVICE);

    if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) {
      UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
      if (device == null) return;

      Log.d(TAG, "USB ATTACHED: vid=" + device.getVendorId() + " pid=" + device.getProductId()
          + " name=" + device.getDeviceName() + " product=" + device.getProductName());

      requestPermission(context, usbManager, device);
    }

    if (ACTION_USB_PERMISSION.equals(action)) {
      UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
      boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);

      Log.d(TAG, "USB PERMISSION: granted=" + granted
          + " device=" + (device != null ? device.getDeviceName() : "null"));

      if (granted && device != null) {
        // Next milestone: open + enumerate interfaces
        UsbDebug.openAndLog(usbManager, device);
      }
    }
  }

  private void requestPermission(Context context, UsbManager usbManager, UsbDevice device) {
    if (usbManager.hasPermission(device)) {
      Log.d(TAG, "Already has permission. Opening now...");
      UsbDebug.openAndLog(usbManager, device);
      return;
    }

    Intent permIntent = new Intent(ACTION_USB_PERMISSION);

    int flags = 0;
    if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;

    PendingIntent pi = PendingIntent.getBroadcast(context, 0, permIntent, flags);
    usbManager.requestPermission(device, pi);

    Log.d(TAG, "Requested permission for " + device.getDeviceName());
  }
}
