const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const manifest = require('./manifest.json');

const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: { index: './src/index.js' },
  plugins: [
    new HtmlWebpackPlugin({
      title: manifest.name,
      template: './src/assets/index.html',
      favicon: './src/assets/favicon.png',
      meta: {
        description: manifest.description,
      },
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'manifest.json',
          to: 'manifest.json'
        },
        {
          from: 'src/assets/icons',
          to: '.'
        }
      ]
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
