const mqtt = require('mqtt');

/**
 * Creates an MQTT 5.0 client with standard configuration.
 * @param {string} clientId - Unique client identifier
 * @param {object} extraOptions - Additional mqtt.connect options (e.g., will, properties)
 */
function createClient(clientId, extraOptions = {}) {
    const client = mqtt.connect('mqtt://localhost:1883', {
        protocolVersion: 5,   // ← MQTT 5.0 mandatory for all advanced features
        clientId,
        clean: true,
        reconnectPeriod: 1000,
        connectTimeout: 5000,
        ...extraOptions
    });

    client.on('error', (err) => {
        console.error(`[${clientId}] ERROR: ${err.message}`);
    });

    client.on('reconnect', () => {
        console.log(`[${clientId}] Reconnecting...`);
    });

    return client;
}

module.exports = { createClient };
