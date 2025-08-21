/* eslint-disable no-console */

import fs from 'fs';
import path from 'path';
import exiftool from 'node-exiftool';
import exiftoolBin from 'dist-exiftool';
import imagemin from 'imagemin';
import webp from 'imagemin-webp';
import sharp from 'sharp';
import { Vibrant } from 'node-vibrant/node';

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    skipConvert: false,
    skipResize: false,
    help: false,
  };

  args.forEach(arg => {
    switch (arg) {
      case '--skip-convert':
        flags.skipConvert = true;
        break;
      case '--skip-resize':
        flags.skipResize = true;
        break;
      case '--help':
      case '-h':
        flags.help = true;
        break;
      default:
        if (arg.startsWith('--')) {
          console.warn(`Unknown flag: ${arg}`);
        }
        break;
    }
  });

  return flags;
}

function showHelp() {
  console.log(`
Usage: node build-feed.mjs [options]

Options:
  --skip-convert    Skip WebP conversion of images (preserves existing files)
  --skip-resize     Skip resizing of images (preserves existing files)
  --help, -h        Show this help message

Note: When skip flags are used, existing files in the output directory are preserved.
      Only when no skip flags are used will the output directory be cleared.

Environment Variables:
  SLOWGRAM_SOURCE_PATH     Path to source images directory
  SLOWGRAM_S3_SOURCE_PATH  Path to output directory
`);
}

const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf-8'));

const sizes = [320, 480, 600, 800, 1080, 1440, 1920, 2560];

async function getExifData(filePath) {
  let data;
  const ep = new exiftool.ExiftoolProcess(exiftoolBin);
  await ep.open();

  try {
    data = await ep.readMetadata(filePath, ['-File:all']);
  } catch (error) {
    console.error(`Error reading EXIF data from ${filePath}:`, error.message);
    throw error;
  } finally {
    await ep.close();
  }
  
  if (!data || !data.data || !data.data[0]) {
    throw new Error(`No EXIF data found in ${filePath}`);
  }
  
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
    console.error(`\nError converting ${fileName} to .webp:`, error.message);
    throw error;
  }
}

function getColor(rgb) {
  const [r, g, b] = rgb;
  
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
      default:
        h = 0;
        break;
    }
  }
  
  h *= 360;
  s *= 100;
  const lPercent = l * 100;
  
  // Check if it's grayscale
  if (s < 15 || lPercent < 15 || lPercent > 85) {
    if (lPercent < 30) return 'black';
    if (lPercent > 70) return 'white';
    return 'gray';
  }
  
  // Find matching color
  const matchingColor = colors.find(color => color.check(h, s, lPercent));
  return matchingColor ? matchingColor.name : 'gray';
}

async function extractColors(filePath) {
  try {
    const palette = await Vibrant.from(filePath).getPalette();
    const colorCounts = {};
    
    const swatchesToProcess = [
      palette.Vibrant, 
      palette.Muted, 
      palette.DarkVibrant, 
      palette.DarkMuted, 
      palette.LightVibrant, 
      palette.LightMuted
    ];
    
    swatchesToProcess.forEach((swatch) => {
      if (swatch) {
        const color = getColor(swatch.rgb);
        colorCounts[color] = (colorCounts[color] || 0) + swatch.population;
      }
    });
    
    // Calculate total population for percentage conversion
    const totalPopulation = Object.values(colorCounts).reduce((sum, pop) => sum + pop, 0);
    
    return Object.entries(colorCounts)
      .sort(([,a], [,b]) => b - a)
      .map(([color, population]) => ({ 
        color, 
        population: Math.round((population / totalPopulation) * 100)
      }));

  } catch (error) {
    console.error(`Error extracting colors from ${filePath}:`, error);
    return [];
  }
}

async function run() {
  console.log();

  const flags = parseArgs();
  
  if (flags.help) {
    showHelp();
    return;
  }

  const photosDir = process.env.SLOWGRAM_SOURCE_PATH;
  const outputDir = process.env.SLOWGRAM_S3_SOURCE_PATH;

  if (!photosDir) {
    throw new Error('SLOWGRAM_SOURCE_PATH environment variable is required');
  }
  
  if (!outputDir) {
    throw new Error('SLOWGRAM_S3_SOURCE_PATH environment variable is required');
  }

  if (!fs.existsSync(photosDir)) {
    throw new Error(`Source directory does not exist: ${photosDir}`);
  }

  console.log(`➤ Finding images in ${photosDir}`);
  const files = fs.readdirSync(photosDir);
  const imageFiles = files.filter((file) => ['.jpg', '.jpeg', '.png', '.gif'].includes(path.extname(file).toLowerCase()));
  
  if (imageFiles.length === 0) {
    console.log('No image files found in source directory');
    return;
  }
  
  console.log(`➤ Found ${imageFiles.length} image files`);
  
  // Show active flags
  const activeFlags = [];
  if (flags.skipResize) activeFlags.push('skip-resize');
  if (flags.skipConvert) activeFlags.push('skip-convert');
  if (activeFlags.length > 0) {
    console.log(`➤ Active flags: ${activeFlags.join(', ')}`);
  }
  
  const images = [];

  if (!flags.skipResize && !flags.skipConvert) {
    console.log(`➤ Clearing ${outputDir} folder...`);
    clearDir(outputDir);
  } else {
    console.log(`➤ Preserving existing files in ${outputDir} folder...`);
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  console.log('➤ Processing images...');
  
  async function processImage(file, index) {
    const progress = `${Math.round((index / imageFiles.length) * 100)}% ${file}`;
    const image = {};

    try {
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

    if (flags.skipResize && flags.skipConvert) {
      // Skip all processing, just copy original file
      process.stdout.write(`  ➤ ${progress}: copying original file                \r`);
      const setPath = `${outputDir}/${parsedPath.name}`;
      if (!fs.existsSync(setPath)) {
        fs.mkdirSync(setPath, { recursive: true });
      }
      const originalFileName = `${parsedPath.name}${parsedPath.ext}`;
      fs.copyFileSync(filePath, `${setPath}/${originalFileName}`);
      image.src.set.push(`${originalFileName} ${originalWidth}w`);
      image.src.src = originalFileName;
    } else {
      const setPath = `${outputDir}/${parsedPath.name}`;
      if (!flags.skipResize && !flags.skipConvert) {
        clearDir(setPath);
      } else if (!fs.existsSync(setPath)) {
        // Preserve existing files, just ensure directory exists
        fs.mkdirSync(setPath, { recursive: true });
      }
      let lastSize = 0;

      const validSizes = sizes.filter(targetWidth => targetWidth <= originalWidth);
      
      await Promise.all(validSizes.map(async (targetWidth) => {
        const targetFileName = `${parsedPath.name}-${targetWidth}w${parsedPath.ext}`;
        const targetFilePath = `${setPath}/${targetFileName}`;
        let finalFileName = targetFileName;

        if (!flags.skipResize) {
          process.stdout.write(`  ➤ ${progress}: resizing to ${targetWidth}w                \r`);
          await sharp(filePath)
            .resize(targetWidth, null, { withoutEnlargement: true })
            .toFile(targetFilePath);
        } else {
          // Skip resize, just copy original
          process.stdout.write(`  ➤ ${progress}: copying original to ${targetWidth}w slot                \r`);
          fs.copyFileSync(filePath, targetFilePath);
        }

        if (!flags.skipConvert) {
          // Convert to webp
          process.stdout.write(`  ➤ ${progress}: Converting ${targetFileName} to .webp        \r`);
          await convertImageToWebp(setPath, targetFileName);
          const convertedFileName = `${parsedPath.name}-${targetWidth}w.webp`;
          finalFileName = convertedFileName;
          
          // Remove the original (jpg) file
          fs.rmSync(targetFilePath);
        }

        image.src.set.push(`${finalFileName} ${targetWidth}w`);

        if (targetWidth > lastSize) {
          lastSize = targetWidth;
          image.src.src = finalFileName;
        }
      }));
    }

      return image;
    } catch (error) {
      console.error(`\n❌ Error processing ${file}:`, error.message);
      return null;
    }
  }

  const processedImages = await Promise.all(
    imageFiles.map((file, index) => processImage(file, index))
  );
  
  // Filter out failed images
  const validImages = processedImages.filter(img => img !== null);
  images.push(...validImages);
  
  if (validImages.length < processedImages.length) {
    const failedCount = processedImages.length - validImages.length;
    console.log(`\n⚠️  ${failedCount} image(s) failed to process`);
  }

  console.log(''.padStart(200, ' '));
  console.log(`✅ Added ${images.length} images in feed.`.padEnd(50, ' '));

  images.sort((a, b) => b.dateTaken.timestamp - a.dateTaken.timestamp);
  console.log('✅ Sorted by date taken.');

  const feedFilePath = `${outputDir}/feed.json`;
  fs.writeFileSync(feedFilePath, JSON.stringify(images, null, 2));
  console.log(`✅ Feed saved as ${feedFilePath}.`);
}

try {
  await run();
  console.log('✅ All done!');
} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  process.exit(1);
}
