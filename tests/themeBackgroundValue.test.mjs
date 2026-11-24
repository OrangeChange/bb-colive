import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBackground, parseGradient, replaceGradient, serializeGradient, readBackground, insertGradientStop, hasBackgroundImage} from '../src/components/themeBackgroundValue.ts';

test('识别图片背景而不把渐变或字符串内容当作图片',()=>{
  assert.equal(hasBackgroundImage('url("asset.png") center / cover no-repeat'),true);
  assert.equal(hasBackgroundImage('linear-gradient(#fff,#000), image-set("asset.png" 1x)'),true);
  assert.equal(hasBackgroundImage('linear-gradient(#fff,#000), rgb(20,30,40)'),false);
  assert.equal(hasBackgroundImage('var(--background, "url(fake)")'),false);
});

test('背景层保留函数逗号、图片及底色', () => {
  const source='url("a,b.png") center/cover, linear-gradient(rgba(255, 255, 255, .3), transparent 32px), rgb(20, 30, 40)';
  const bg=parseBackground(source);
  assert.equal(bg.layers.length,3);
  const gradient=parseGradient(bg.layers[1]);
  assert.equal(gradient.stops[1].position,32);
  assert.equal(gradient.stops[1].unit,'px');
  gradient.angle=120;
  const next=replaceGradient(bg,1,gradient);
  assert.ok(next.startsWith('url("a,b.png") center/cover,'));
  assert.ok(next.endsWith('rgb(20, 30, 40)'));
  assert.ok(next.includes('120deg'));
});
test('线性和径向色点位置可读写',()=>{
  const linear=parseGradient('linear-gradient(to right, #fff, #000 50%, transparent)');
  assert.equal(linear.angle,90);
  assert.deepEqual(linear.stops.map(s=>s.position),[0,50,100]);
  const radial=parseGradient('radial-gradient(ellipse at 25% 75%, #fff 0%, #000 100%)');
  assert.equal(radial.shape,'ellipse');
  assert.deepEqual(radial.center,[25,75]);
  assert.equal(parseGradient(serializeGradient(radial)).kind,'radial');
});
test('不支持的表达式保留给CSS控制',()=>{
  assert.equal(parseGradient('conic-gradient(red, blue)'),null);
  assert.equal(parseGradient('linear-gradient(red calc(10% + 2px), blue)'),null);
  assert.equal(parseGradient('linear-gradient(red 20px, green, blue 80%)'),null);
  assert.equal(parseGradient('linear-gradient(to top right, red, blue)'),null);
});
test('变量色点和原背景定位不被其他色点的编辑覆盖',()=>{
 const layer='linear-gradient(var(--card-sheen), transparent 32px) center / cover no-repeat';
 const background=parseBackground(layer+', #102030');
 const gradient=parseGradient(layer);gradient.stops[1].position=40;
 const edited=replaceGradient(background,0,gradient);
 assert.match(edited,/var\(--card-sheen\)/);
 assert.match(edited,/transparent 40px\) center \/ cover no-repeat, #102030$/);
});
test('背景读取同时包含图像和底色',()=>{
  assert.equal(readBackground({backgroundImage:'none',backgroundColor:'rgb(1, 2, 3)'}),'rgb(1, 2, 3)');
  assert.equal(readBackground({backgroundImage:'linear-gradient(red, blue)',backgroundColor:'rgb(1, 2, 3)'}),'linear-gradient(red, blue), rgb(1, 2, 3)');
  const full='url("sample.png") center / cover no-repeat, linear-gradient(red, blue)';
  assert.equal(readBackground({background:full,backgroundImage:'url("sample.png"), linear-gradient(red, blue)',backgroundColor:'transparent'}),full);
});

test('连续新增沿相邻区间插入并保持透明色的插值',()=>{
 let gradient=parseGradient('linear-gradient(rgba(255, 255, 255, 1), transparent 100%)'),selected=0;
 for(let i=0;i<3;i++){const result=insertGradientStop(gradient,selected,260);gradient=result.gradient;selected=result.index;}
 assert.deepEqual(gradient.stops.map(s=>s.position),[0,50,75,87.5,100]);
 assert.equal(gradient.stops[1].color,'rgba(255, 255, 255, 0.5)');
 const pixel=insertGradientStop(parseGradient('linear-gradient(#fff, transparent 32px)'),0,32);
 assert.equal(pixel.gradient.stops[1].position,16);
 assert.equal(pixel.gradient.stops[1].unit,'px');
});
