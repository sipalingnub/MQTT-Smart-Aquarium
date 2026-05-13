/**
 * ═══════════════════════════════════════════════════
 *  SUBSCRIBER 1: Main_Dashboard (CLI)
 *  Role   : Full-system monitor — receives ALL topics
 *  Features: Wildcard # (#2), Flow Control (#10),
 *            User Properties logging (#4)
 * ═══════════════════════════════════════════════════
 */

const { createClient } = require('./common/mqttClient');

// ─────────────────────────────────────────────────────────────────────────
// [FEATURE 10] Flow Control (Backpressure)
// receiveMaximum limits how many QoS 1/2 messages the broker can send
// to this client before receiving an ACK.
// Here: broker will hold off after 10 in-flight messages, preventing
// this dashboard from being overwhelmed in high-throughput scenarios.
// ─────────────────────────────────────────────────────────────────────────
const client = createClient('main_dashboard', {
    properties: {
        receiveMaximum: 10   // [FEATURE 10] Max 10 unACK'd messages at once
    }
});

// ── State object representing what the dashboard displays ─────────────────
const state = {
    sensor: {
        ph:          'N/A',
        temperature: 'N/A',
        status:      'UNKNOWN',
        deviceId:    'N/A',
        location:    'N/A'
    },
    dispenser: {
        stock:  'N/A',
        status: 'UNKNOWN'
    },
    alerts:   [],
    msgCount: 0,
    lastUpdate: '—'
};

// ── Render the dashboard to terminal ─────────────────────────────────────
function renderDashboard() {
    console.clear();
    const bar = (pct) => {
        const filled = Math.round(pct / 5);
        return '[' + '█'.repeat(filled) + '░'.repeat(20 - filled) + ']';
    };

    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║       🐠   SMART AQUARIUM — LIVE DASHBOARD           ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  Sensor Node   : ${state.sensor.status.padEnd(34)}║`);
    console.log(`║  Device ID     : ${state.sensor.deviceId.padEnd(34)}║`);
    console.log(`║  Location      : ${state.sensor.location.padEnd(34)}║`);
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  pH Level      : ${String(state.sensor.ph).padEnd(34)}║`);
    console.log(`║  Temperature   : ${String(state.sensor.temperature + ' °C').padEnd(34)}║`);
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  Dispenser     : ${state.dispenser.status.padEnd(34)}║`);
    const stock = typeof state.dispenser.stock === 'number' ? state.dispenser.stock : 0;
    const stockDisplay = typeof state.dispenser.stock === 'number'
        ? `${bar(stock)} ${stock}%`
        : 'N/A';
    console.log(`║  Food Stock    : ${stockDisplay.padEnd(34)}║`);
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log('║  ⚠️  RECENT ALERTS                                    ║');
    const recent = state.alerts.slice(-4);
    if (recent.length === 0) {
        console.log('║   ✅ No alerts — system nominal                       ║');
    } else {
        recent.forEach(a => {
            const line = `   ${a}`;
            console.log(`║${line.substring(0, 54).padEnd(54)}║`);
        });
    }
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  Messages received : ${String(state.msgCount).padEnd(31)}║`);
    console.log(`║  Flow Control      : receiveMaximum = 10             ║`);
    console.log(`║  Subscription      : aquarium/# (wildcard)           ║`);
    console.log(`║  Last update       : ${state.lastUpdate.padEnd(31)}║`);
    console.log('╚══════════════════════════════════════════════════════╝');
}

client.on('connect', () => {
    console.log('[MAIN_DASHBOARD] ✅ Connected [Flow Control: receiveMaximum=10]');

    // ─────────────────────────────────────────────────────────────────────
    // [FEATURE 2] Topic Wildcard (#) — Multi-Level
    // A single subscription to 'aquarium/#' captures ALL topics:
    //   aquarium/sensor/ph, aquarium/sensor/temperature,
    //   aquarium/sensor/status, aquarium/dispenser/stock,
    //   aquarium/dispenser/command, aquarium/alert, etc.
    // This is far more efficient than subscribing to each topic individually.
    // ─────────────────────────────────────────────────────────────────────
    client.subscribe('aquarium/#', { qos: 1 });
    console.log('[MAIN_DASHBOARD] 📥 Subscribed: aquarium/# (Multi-Level Wildcard #)');

    renderDashboard();
});

client.on('message', (topic, message, packet) => {
    state.msgCount++;
    state.lastUpdate = new Date().toLocaleTimeString();

    let payload;
    try {
        payload = JSON.parse(message.toString());
    } catch {
        return;
    }

    // ── Route message to state based on topic ─────────────────────────
    switch (topic) {
        case 'aquarium/sensor/ph':
            if (payload.value !== undefined) state.sensor.ph = payload.value;
            break;
        case 'aquarium/sensor/temperature':
            if (payload.value !== undefined) state.sensor.temperature = payload.value;
            break;
        case 'aquarium/sensor/status':
            state.sensor.status = payload.status || 'UNKNOWN';
            break;
        case 'aquarium/dispenser/status':
            state.dispenser.status = payload.status || 'UNKNOWN';
            break;
        case 'aquarium/dispenser/stock':
            if (payload.stock !== undefined) state.dispenser.stock = payload.stock;
            break;
        case 'aquarium/alert':
            state.alerts.push(`[${payload.level}] ${payload.message || JSON.stringify(payload)}`);
            if (state.alerts.length > 10) state.alerts.shift();
            break;
        default:
            // Other topics (commands, responses) logged but not rendered
            break;
    }

    // ── [FEATURE 4] User Properties — log metadata when present ──────
    const props = packet.properties;
    if (props?.userProperties) {
        const up = props.userProperties;
        state.sensor.deviceId = up.Device_ID || state.sensor.deviceId;
        state.sensor.location = up.Location   || state.sensor.location;
    }

    renderDashboard();
});

process.on('SIGINT', () => {
    console.log('\n[MAIN_DASHBOARD] 🛑 Disconnecting...');
    client.end();
    process.exit(0);
});
