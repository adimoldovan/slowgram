const r = require.context('./assets/social', false, /\.(png|jpe?g|svg)$/);
const icons = {};
r.keys().forEach((item) => {
  icons[item.replace('./', '')] = r(item);
});

export default icons;
