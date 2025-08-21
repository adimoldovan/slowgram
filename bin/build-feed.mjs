/* eslint-disable no-console */

import fs from 'fs';
import path from 'path';
import exiftool from 'node-exiftool';
import exiftoolBin from 'dist-exiftool';
import imagemin from 'imagemin';
import webp from 'imagemin-webp';
import sharp from 'sharp';
import { Vibrant } from 'node-vibrant/node';

const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf-8'));

const sizes = [320, 480, 600, 800, 1080, 1440, 1920, 2560];

async function getExifData(filePath) {
  let data;
  const ep = new exiftool.ExiftoolProcess(exiftoolBin);
  await ep.open();

  try {
    data = await ep.readMetadata(filePath, ['-File:all']);
  } catch (error) {
    console.error(error);
  }
  await ep.close();
  return data.data[0];
}

function clearDir(dir) {
  fs.rmSync(dir, {
    recursive: true,
    force: true,
  });
  fs.mkdirSync(dir, { recursive: true });
}

async function convertImageToWebp(dir, fileName) {
  try {
    await imagemin([`${dir}/${fileName}`], {
      destination: dir,
      plugins: [
        webp({ quality: 80 }),
      ],
    });
  } catch (error) {
    console.log('');
    throw new Error(`Error converting ${fileName} to .webp: ${error}`);
  }
}

function getRainbowColor(rgb) {
  const [r, g, b] = rgb;
  
  // Define rainbow color ranges
  const colors = [
    { name: 'red', range: [0, 25], check: (h, s, l) => (h >= 345 || h <= 15) && s >= 30 && l >= 20 && l <= 80 },
    { name: 'orange', range: [15, 45], check: (h, s, l) => h >= 15 && h <= 45 && s >= 40 && l >= 25 && l <= 75 },
    { name: 'yellow', range: [45, 70], check: (h, s, l) => h >= 45 && h <= 70 && s >= 30 && l >= 30 && l <= 85 },
    { name: 'green', range: [70, 150], check: (h, s, l) => h >= 70 && h <= 150 && s >= 25 && l >= 20 && l <= 80 },
    { name: 'blue', range: [150, 250], check: (h, s, l) => h >= 180 && h <= 250 && s >= 25 && l >= 20 && l <= 80 },
    { name: 'purple', range: [250, 345], check: (h, s, l) => h >= 250 && h <= 345 && s >= 25 && l >= 20 && l <= 80 },
  ];
  
  // Convert RGB to HSL
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const diff = max - min;
  
  const l = (max + min) / 2;
  let s = 0;
  let h = 0;
  
  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
    
    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / diff + (gNorm < bNorm ? 6 : 0)) / 6;
        break;
      case gNorm:
        h = ((bNorm - rNorm) / diff + 2) / 6;
        break;
      case bNorm:
        h = ((rNorm - gNorm) / diff + 4) / 6;
        break;
    }
  }
  
  h *= 360;
  s *= 100;
  const lPercent = l * 100;
  
  // Check if it's grayscale
  if (s < 15 || lPercent < 15 || lPercent > 85) {
    return lPercent < 30 ? 'black' : lPercent > 70 ? 'white' : 'gray';
  }
  
  // Find matching rainbow color
  for (const color of colors) {
    if (color.check(h, s, lPercent)) {
      return color.name;
    }
  }
  
  return 'gray';
}

async function extractColors(filePath) {
  try {
    const palette = await Vibrant.from(filePath).getPalette();
    const colorCounts = {};
    
    for (const [name, swatch] of Object.entries(palette)) {
      if (swatch) {
        const rainbowColor = getRainbowColor(swatch.rgb);
        colorCounts[rainbowColor] = (colorCounts[rainbowColor] || 0) + swatch.population;
      }
    }
    
    // Return top 3 dominant colors
    return Object.entries(colorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([color]) => color);
  } catch (error) {
    console.error(`Error extracting colors from ${filePath}:`, error);
    return [];
  }
}

async function run() {
  console.log();

  const photosDir = process.env.SLOWGRAM_SOURCE_PATH;
  const outputDir = process.env.SLOWGRAM_S3_SOURCE_PATH;

  console.log(`➤ Finding images in ${photosDir}`);
  const files = fs.readdirSync(photosDir);
  const imageFiles = files.filter((file) => ['.jpg', '.jpeg', '.png', '.gif'].includes(path.extname(file)));
  const images = [];

  console.log(`➤ Clearing ${outputDir} folder...`);
  clearDir(outputDir);

  console.log('➤ Processing images...');
  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const progress = `${Math.round((i / imageFiles.length) * 100)}% ${file}`;
    const image = {};

    process.stdout.write(`  ➤ ${progress}: getting EXIF data\r`);
    const filePath = `${photosDir}/${file}`;
    const data = await getExifData(filePath);

    // Get the date taken in timestamp and original format
    const dateParts = data.DateTimeOriginal.split(' ');
    const datePart = dateParts[0].replace(/:/g, '-');
    const timePart = dateParts[1];
    const timestamp = Date.parse(`${datePart}T${timePart}`);
    image.dateTaken = {
      timestamp,
      original: data.DateTimeOriginal,
    };

    // Set the rest of the image data
    image.camera = `${data.Make} ${data.Model}`;
    image.location = {
      city: data.City,
      state: data.State,
      country: data.Country,
    };
    image.title = data.ObjectName;
    image.keywords = data.Keywords;

    // Extract dominant colors
    process.stdout.write(`  ➤ ${progress}: extracting colors\r`);
    image.colors = await extractColors(filePath);

    // Build the srcset
    const parsedPath = path.parse(filePath);
    const originalWidth = data.ImageSize.split('x')[0];
    image.src = {
      path: `${config.feed.photos}/${parsedPath.name}`,
      set: [],
    };

    const setPath = `${outputDir}/${parsedPath.name}`;
    clearDir(setPath);
    let lastSize = 0;

    for (const targetWidth of sizes) {
      if (targetWidth <= originalWidth) {
        process.stdout.write(`  ➤ ${progress}: resizing to ${targetWidth}w                \r`);

        const targetFileName = `${parsedPath.name}-${targetWidth}w${parsedPath.ext}`;
        const targetFilePath = `${setPath}/${targetFileName}`;

        await sharp(filePath)
          .resize(targetWidth, null, { withoutEnlargement: true })
          .toFile(targetFilePath);

        // Convert to webp
        process.stdout.write(`  ➤ ${progress}: Converting ${targetFileName} to .webp        \r`);
        await convertImageToWebp(setPath, targetFileName);
        const convertedFileName = `${parsedPath.name}-${targetWidth}w.webp`;

        image.src.set.push(`${convertedFileName} ${targetWidth}w`);

        // Remove the original (jpg) file
        fs.rmSync(targetFilePath);

        if (targetWidth > lastSize) {
          lastSize = targetWidth;
          image.src.src = convertedFileName;
        }
      }
    }

    images.push(image);
  }

  console.log(''.padStart(200, ' '));
  console.log(`✅ Added ${images.length} images in feed.`.padEnd(50, ' '));

  images.sort((a, b) => b.dateTaken.timestamp - a.dateTaken.timestamp);
  console.log('✅ Sorted by date taken.');

  const feedFilePath = `${outputDir}/feed.json`;
  fs.writeFileSync(feedFilePath, JSON.stringify(images));
  console.log(`✅ Feed saved as ${feedFilePath}.`);
}

await run();
console.log('✅ All done!');
