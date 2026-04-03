const iconModules = import.meta.glob('./assets/social/*.{png,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const icons = {};
for (const [path, url] of Object.entries(iconModules)) {
  const filename = path.split('/').pop();
  icons[filename] = url;
}

export default icons;
