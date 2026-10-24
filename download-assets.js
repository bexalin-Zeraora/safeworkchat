const https = require('https');
const fs = require('fs');
const path = require('path');

const assets = [
  // CSS and JS files
  {
    url: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
    dest: 'frontend/vendor/bootstrap.min.css'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
    dest: 'frontend/vendor/bootstrap.bundle.min.js'
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    dest: 'frontend/vendor/all.min.css'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/quill@2.0.0/dist/quill.snow.css',
    dest: 'frontend/vendor/quill.snow.css'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/quill@2.0.0/dist/quill.js',
    dest: 'frontend/vendor/quill.js'
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
    dest: 'frontend/vendor/mammoth.browser.min.js'
  },
  {
    url: 'https://cdn.socket.io/4.7.4/socket.io.min.js',
    dest: 'frontend/vendor/socket.io.min.js'
  },
  // CRITICAL: Font Awesome Webfonts (This fixes the blank icons!)
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-solid-900.woff2',
    dest: 'frontend/vendor/webfonts/fa-solid-900.woff2'
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-regular-400.woff2',
    dest: 'frontend/vendor/webfonts/fa-regular-400.woff2'
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-brands-400.woff2',
    dest: 'frontend/vendor/webfonts/fa-brands-400.woff2'
  }
];

const download = (url, dest) => {
  return new Promise((resolve, reject) => {
    // Create directory if it doesn't exist
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✅ Downloaded: ${path.basename(dest)}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
};

const run = async () => {
  console.log('🚀 Starting offline asset download...\n');
  
  for (const asset of assets) {
    console.log(` Downloading ${path.basename(asset.dest)}...`);
    await download(asset.url, asset.dest);
  }
  console.log('\n🎉 All assets downloaded successfully! You are now 100% offline ready.');
};

run().catch(console.error);