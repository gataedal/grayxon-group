package com.grayxon.caixuntv.backend;

/** Future extension point for an authenticated outbound TLS connection to a command backend. */
public interface CommandTransport {
    void connect();
    void disconnect();
    boolean isConnected();
}
