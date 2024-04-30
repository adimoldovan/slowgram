import fs from 'fs';
import path from 'path';
import exiftool from 'node-exiftool';
import exiftoolBin from 'dist-exiftool';
import config from '../config.json' assert { type: 'json' };
import imagemin from 'imagemin';
import webp from 'imagemin-webp';
import sharp from 'sharp';

const sizes = [320, 480, 600, 800, 1080];

async function run() {
  console.log();

  const photosDir = process.env.SLOWGRAM_SOURCE_PATH;
  const outputDir = process.env.SLOWGRAM_S3_SOURCE_PATH;

  console.log(`➤ Finding images in ${photosDir}`);
  const files = fs.readdirSync(photosDir);
  const imageFiles = files.filter(file => ['.jpg', '.jpeg', '.png', '.gif'].includes(path.extname(file)));
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

    // Build the srcset
    const parsedPath = path.parse(filePath);
    const originalWidth = data.ImageSize.split('x')[0];
    image.src = {
      path: `${config.feed.photos}/${parsedPath.name}`,
      set: []
    };

    const setPath = `${outputDir}/${parsedPath.name}`;
    clearDir(setPath);
    let lastSize = 0;

    for (const targetWidth of sizes) {
      if (targetWidth <= originalWidth) {
        process.stdout.write(`  ➤ ${progress}: resizing to ${originalWidth}w                \r`);

        let targetFileName = `${parsedPath.name}-${targetWidth}w${parsedPath.ext}`;
        const targetFilePath = `${setPath}/${targetFileName}`;

        await sharp(filePath)
          .resize(targetWidth)
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
    force: true
  });
  fs.mkdirSync(dir, { recursive: true });
}

async function convertImageToWebp(dir, fileName) {
  try {
    await imagemin([`${dir}/${fileName}`], {
      destination: dir,
      plugins: [
        webp({ quality: 80 })
      ]
    });
  } catch (error) {
    console.log('');
    throw new Error(`Error converting ${fileName} to .webp: ${error}`);
  }
}

await run();
console.log(`✅ All done!`);
