const fs = require('fs');
const path = require('path');
const exiftool = require('node-exiftool');
const exiftoolBin = require('dist-exiftool');
const config = require('../config');

const photosDir = '/Volumes/extreme-pro/Media/Photo/Photos/Slowgram';
const files = fs.readdirSync(photosDir);
const imageFiles = files.filter(file => ['.jpg', '.jpeg', '.png', '.gif'].includes(path.extname(file)));
const images = [];
const ep = new exiftool.ExiftoolProcess(exiftoolBin);

async function readMetadata() {
  await ep.open();
  for (const file of imageFiles) {
    try {
      const data = await ep.readMetadata(`${photosDir}/${file}`, ['-File:all']);

      const imageData = {
        src: `${config.feed.url}/photos/${file}`,
        date: data.data[0].DateTimeOriginal,
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
      }

      console.log(imageData)
      images.push(imageData);
    } catch (error) {
      console.error(error);
    }
  }
  console.log(images.length);

  fs.writeFileSync(`${photosDir}/feed.json`, JSON.stringify(images, null, 2));

  await ep.close();
}

readMetadata();
