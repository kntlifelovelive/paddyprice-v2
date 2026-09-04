package com.paddy.paddyprice;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(android.os.Bundle savedInstanceState) {
    // IMPORTANT: plugins MUST be registered BEFORE super.onCreate().
    registerPlugin(DeviceAuthPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
