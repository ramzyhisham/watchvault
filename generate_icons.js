const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');

const sourceFile = path.join(__dirname, 'icon-512.jpg');

if (!fs.existsSync(sourceFile)) {
    console.error('Source icon-512.jpg not found!');
    process.exit(1);
}

console.log('Generating PWA icons from icon-512.jpg...');

Jimp.read(sourceFile)
    .then(async (image) => {
        // 512x512 PNG
        await image.clone().resize(512, 512).writeAsync(path.join(__dirname, 'icon-512.png'));
        console.log('Created icon-512.png');

        // 192x192 PNG
        await image.clone().resize(192, 192).writeAsync(path.join(__dirname, 'icon-192.png'));
        console.log('Created icon-192.png');

        // apple-touch-icon.png (180x180)
        await image.clone().resize(180, 180).writeAsync(path.join(__dirname, 'apple-touch-icon.png'));
        console.log('Created apple-touch-icon.png');

        // favicon-32.png
        await image.clone().resize(32, 32).writeAsync(path.join(__dirname, 'favicon-32.png'));
        console.log('Created favicon-32.png');

        // favicon-16.png
        await image.clone().resize(16, 16).writeAsync(path.join(__dirname, 'favicon-16.png'));
        console.log('Created favicon-16.png');

        // favicon.ico (32x32)
        await image.clone().resize(32, 32).writeAsync(path.join(__dirname, 'favicon.ico'));
        console.log('Created favicon.ico');

        console.log('Successfully generated all PWA icons!');
    })
    .catch((err) => {
        console.error('Failed to generate icons:', err);
        process.exit(1);
    });
