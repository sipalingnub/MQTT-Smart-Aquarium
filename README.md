# 🐟 Implementasi Protokol MQTT 5.0 pada Simulasi Smart Aquarium

**Nama:** Muhammad Khairul Yahya
**NRP:** 5027241092

**Nama:** Muhammad Huda Rabbani
**NRP:** 5027241098

---

## 1. Deskripsi Singkat Proyek
Proyek ini adalah simulasi sistem *Internet of Things* (IoT) untuk *Smart Aquarium* menggunakan protokol MQTT versi 5.0 berbasis Node.js. Sistem dirancang untuk memantau kondisi air (suhu dan pH) serta mengontrol mesin dispenser pakan ikan secara otomatis maupun manual. Proyek ini dibangun murni melalui perangkat lunak (*script* simulasi) untuk mendemonstrasikan ke-10 fitur lanjutan dari MQTT 5.0, dengan arsitektur yang melibatkan 3 *Publisher* dan 2 *Subscriber*.

## 2. Arsitektur Sistem
- **Broker:** Eclipse Mosquitto (Mendukung MQTT 5.0).
- **Publisher 1 (Sensor Node):** Mempublikasikan data suhu dan pH air secara periodik.
- **Publisher 2 (Dispenser Node):** Bertindak sebagai aktuator untuk menerima perintah dan mengirimkan status sisa stok pakan.
- **Publisher 3 (User App):** Aplikasi untuk mengirim perintah manual ("Beri Makan") dan meminta data stok (Request-Response).
- **Subscriber 1 (Main Dashboard):** Menerima seluruh data dari sensor dan aktuator untuk divisualisasikan secara *real-time* berbasis Web (HTML/JS).
- **Subscriber 2 (Alert Bot):** Menerima notifikasi darurat (berjalan secara berkelompok/ *Load Balancing*).

 ![image alt](https://github.com/sipalingnub/MQTT-Smart-Aquarium/blob/a8db388abbb719e4a1048fa9bea9a47f927cdf67/common/mermaid-drawing.png)

## 3. Design Topic (Topic Tree)
Desain hierarki topik dirancang dengan struktur yang rapi agar mudah di-*filter* menggunakan *wildcard*:

- `aquarium/sensor/suhu` : Topik untuk aliran data suhu air.
- `aquarium/sensor/ph` : Topik untuk aliran data keasaman air.
- `aquarium/dispenser/kontrol` : Topik untuk menerima perintah aktuator.
- `aquarium/dispenser/status` : Topik balasan berisi status sisa pakan.
- `aquarium/alert` : Topik khusus untuk pesan darurat dan *Last Will and Testament* (LWT).

## 4. Fitur-fitur MQTT 5.0 (Penjelasan dan Hasil)

1. **Publish/Subscribe & QoS:** Pengiriman data sensor menggunakan QoS 0, sedangkan perintah kritis "Beri Makan" menggunakan QoS 2 (*Exactly Once*).
   > **Screenshot:** `[Masukkan gambar terminal User App mengirim perintah QoS 2 dan diterima oleh Dispenser]`
2. **Topic Wildcards (+ & #):** Klien Dashboard me-*subscribe* ke `aquarium/#` untuk menangkap semua data secara efisien tanpa *subscribe* satu per satu.
3. **Topic Alias:** Sensor Node menyingkat nama topik `aquarium/sensor/suhu` menjadi sebuah *Integer ID* pada *header* untuk menghemat pemakaian *bandwidth*.
4. **User Properties:** Sensor Node menyisipkan metadata (contoh: `Location: "Ruang Tamu"`) di dalam *header* paket MQTT, terpisah dari *payload* utama.
   > **Screenshot:** `[Masukkan gambar console.log yang menampilkan header properties pada Dashboard]`
5. **Retain Message:** Data suhu dikirim dengan properti `retain: true`. Klien yang baru terkoneksi langsung mendapatkan suhu terakhir tanpa harus menunggu siklus pengiriman berikutnya.
6. **Message Expiry Interval:** Perintah pemberian makan dari User App diberi waktu kedaluwarsa 30 detik agar tidak dieksekusi jika dispenser *offline* terlalu lama.
7. **Last Will and Testament (LWT):** Jika koneksi Sensor Node terputus secara tidak wajar (misal: di-kill paksa), broker akan otomatis mempublikasikan pesan "Sensor Offline" ke topik `aquarium/alert`.
   > **Screenshot:** `[Masukkan gambar terminal saat kamu mematikan paksa (Ctrl+C) sensor_node.js dan Alert Bot menerima notifikasi offline]`
8. **Request-Response:** User App mengirim *request* cek stok ke Dispenser dengan melampirkan *Response Topic* dan *Correlation Data*. Dispenser membalas tepat ke topik tersebut.
9. **Shared Subscriptions:** Menjalankan beberapa Alert Bot sekaligus dengan topik `$share/botgroup/aquarium/alert` agar notifikasi terdistribusi (satu pesan hanya diterima satu bot).
   > **Screenshot:** `[Masukkan gambar 2 terminal Alert Bot berdampingan, tunjukkan pesan hanya masuk ke salah satu terminal saja]`
10. **Flow Control:** Dashboard membatasi *Receive Maximum* untuk mengontrol *backpressure* (menghindari *overload* pesan yang masuk secara bersamaan).

![image alt](https://github.com/sipalingnub/MQTT-Smart-Aquarium/blob/a8db388abbb719e4a1048fa9bea9a47f927cdf67/common/Screenshot%202026-05-13%20200429.png)

![image alt](https://github.com/sipalingnub/MQTT-Smart-Aquarium/blob/a8db388abbb719e4a1048fa9bea9a47f927cdf67/common/Screenshot%202026-05-13%20200434.png)

## 5. Dashboard Monitor
Dashboard merupakan antarmuka web interaktif (`dashboard.html`) yang terhubung langsung ke broker MQTT melalui WebSockets.

- **Fitur:** Menampilkan pembaruan suhu dan pH secara *real-time*, tombol interaktif untuk mengirim perintah ke dispenser, dan log aktivitas/peringatan sistem.
- **Screenshot:** `[Masukkan gambar tampilan halaman Dashboard Web saat penuh dengan data]`
