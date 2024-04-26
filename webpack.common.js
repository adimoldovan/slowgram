const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const data = require('./src/profile.json');

module.exports = {
  entry: { index: './src/index.js' },
  plugins: [
    new HtmlWebpackPlugin({
      title: data.displayName,
      favicon: './src/assets/favicon.png',
    }),
  ],
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },
};
