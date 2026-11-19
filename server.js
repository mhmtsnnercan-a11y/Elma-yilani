// Elma Yılanı – TikTok LIVE köprüsü
// Kullanım:  node server.js            (varsayılan kullanıcı aşağıda)
//            node server.js kullaniciadi
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const lib = require('tiktok-live-connector');

const KULLANICI = (process.argv[2] || process.env.TIKTOK_USER || 'foursnake').replace(/^@/, '');
const PORT = Number(process.env.PORT || 8080);
const Conn = lib.TikTokLiveConnection || lib.WebcastPushConnection;
if (process.env.EULER_API_KEY && lib.SignConfig) lib.SignConfig.apiKey = process.env.EULER_API_KEY;

// ---------- Web sunucusu ----------
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/ping')) { res.writeHead(200); return res.end('ok'); }
  const file = path.join(__dirname, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(500); return res.end('index.html bulunamadı'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});
const wss = new WebSocketServer({ server });
let status = { type: 'status', ok: false, user: KULLANICI };
function send(msg) {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(s);
}
wss.on('connection', ws => ws.send(JSON.stringify(status)));

// ---------- Veri okuma (kütüphane sürümleri arasında farklı alanlar) ----------
function kisi(d) {
  const u = d.user || d;
  const pp = u.profilePictureUrl
    || (u.profilePicture && (u.profilePicture.url || u.profilePicture.urls || [])[0])
    || (u.profilePicture && u.profilePicture.urlList && u.profilePicture.urlList[0]) || '';
  return { id: String(u.uniqueId || u.userId || u.nickname || '?'), name: u.nickname || u.uniqueId || 'Biri', pic: pp };
}

// ---------- TikTok bağlantısı (otomatik yeniden bağlanır, 7/24) ----------
let conn = null, timer = null;
function tekrar(sn = 15) {
  status = { type: 'status', ok: false, user: KULLANICI }; send(status);
  clearTimeout(timer); timer = setTimeout(baglan, sn * 1000);
}
function baglan() {
  if (conn) { try { conn.removeAllListeners(); conn.disconnect(); } catch (e) {} }
  conn = new Conn(KULLANICI, { enableExtendedGiftInfo: true });

  conn.on('gift', d => {
    const g = d.giftDetails || {};
    const type = d.giftType ?? g.giftType;
    if (type === 1 && !d.repeatEnd) return;          // seri hediye: bitince say
    const m = {
      type: 'gift', user: kisi(d),
      giftName: d.giftName || g.giftName || (d.extendedGiftInfo && d.extendedGiftInfo.name) || 'Hediye',
      diamonds: d.diamondCount ?? g.diamondCount ?? (d.extendedGiftInfo && d.extendedGiftInfo.diamond_count) ?? 1,
      count: d.repeatCount || 1,
    };
    console.log(`🎁 ${m.user.name}: ${m.giftName} x${m.count} (${m.diamonds} jeton)`);
    send(m);
  });
  conn.on('like', d => send({ type: 'like', user: kisi(d), count: d.likeCount || d.count || 1 }));
  conn.on('follow', d => { const u = kisi(d); console.log(`➕ ${u.name} takip etti`); send({ type: 'follow', user: u }); });
  conn.on('disconnected', () => { console.log('Bağlantı koptu, tekrar deneniyor…'); tekrar(10); });
  conn.on('streamEnd', () => { console.log('Yayın bitti, yeniden açılmasını bekliyorum…'); tekrar(30); });
  conn.on('error', e => console.log('Hata:', e && e.message ? e.message : e));

  conn.connect()
    .then(() => {
      console.log(`✅ @${KULLANICI} canlı yayınına bağlandı`);
      status = { type: 'status', ok: true, user: KULLANICI }; send(status);
    })
    .catch(e => {
      console.log(`⏳ @${KULLANICI} şu an canlı değil ya da bağlanamadı (${(e && e.message) || e}). 15 sn sonra tekrar.`);
      tekrar(15);
    });
}

server.listen(PORT, () => {
  console.log(`🐍 Oyun açık:  http://localhost:${PORT}`);
  console.log(`   TikTok kullanıcı: @${KULLANICI}`);
  baglan();
});
process.on('uncaughtException', e => console.log('Beklenmeyen hata:', e.message));
process.on('unhandledRejection', e => console.log('Beklenmeyen hata:', e && e.message));
