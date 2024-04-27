const r = require.context('./assets/social', false, /\.(png|jpe?g|svg)$/);
const icons = {};
// eslint-disable-next-line array-callback-return
r.keys()
  .map((item) => {
    icons[item.replace('./', '')] = r(item);
  });

export default icons;
