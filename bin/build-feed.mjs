import fs from 'fs';
import path from 'path';
import exiftool from 'node-exiftool';
import exiftoolBin from 'dist-exiftool';
import config from '../config.json' assert { type: "json" };
import imagemin from "imagemin";
import webp from "imagemin-webp";

const photosDir = process.env.SOURCE_PATH;
console.log(`Reading photos from ${photosDir}`);
const files = fs.readdirSync(photosDir);
const imageFiles = files.filter(file => ['.jpg', '.jpeg', '.png', '.gif'].includes(path.extname(file)));
const images = [];
const ep = new exiftool.ExiftoolProcess(exiftoolBin);

async function readMetadata() {
  console.log('Reading metadata from images and building the feed...');
  await ep.open();
  for (const file of imageFiles) {
    console.log(`\tReading data for ${file}...`);
    try {
      const data = await ep.readMetadata(`${photosDir}/${file}`, ['-File:all']);

      const dateParts = data.data[0].DateTimeOriginal.split(' ');
      const datePart = dateParts[0].replace(/:/g, '-');
      const timePart = dateParts[1];
      const timestamp = Date.parse(`${datePart}T${timePart}`);

      const parsedPath = path.parse(file);
      parsedPath.ext = '.webp';
      parsedPath.base = `${parsedPath.name}${parsedPath.ext}`;
      const webpFile = path.format(parsedPath);

      const imageData = {
        src: `${config.feed.photos}/${webpFile}`,
        dateTaken: {
          timestamp,
          original: data.data[0].DateTimeOriginal,
        },
        size: {
          width: data.data[0].ImageSize.split('x')[0],
          height: data.data[0].ImageSize.split('x')[1],
        },
        camera: `${data.data[0].Make} ${data.data[0].Model}`,
        location: {
          city: data.data[0].City,
          state: data.data[0].State,
          country: data.data[0].Country,
        },
        title: data.data[0].ObjectName,
        keywords: data.data[0].Keywords,
      };

      // console.log(imageData);
      images.push(imageData);
    } catch (error) {
      console.error(error);
    }
  }

  console.log(`${images.length} images`);

  console.log('Sorting by date taken');
  images.sort((a, b) => b.dateTaken.timestamp - a.dateTaken.timestamp);

  fs.writeFileSync(`${photosDir}/s3/feed.json`, JSON.stringify(images));

  await ep.close();
}

async function convertImages() {
  console.log('Converting images to webp format...');
  const files = fs.readdirSync(photosDir);
  const imageFiles = files.filter(file => ['.jpg', '.jpeg', '.png', '.gif'].includes(path.extname(file)));
  for (const file of imageFiles) {
    console.log(`\tConverting ${file}...`);
    const input = `${photosDir}/${file}`;
    const output = `${photosDir}/s3/${file}`;
    await imagemin([input], {
      destination: `${photosDir}/s3`,
      plugins: [
        webp({ quality: 75 })
      ]
    });
  }
}

await readMetadata();
await convertImages();
