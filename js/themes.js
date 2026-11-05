// Each song owns a whole OS: a painting of hers as the wallpaper, a full reskin in css/site.css (icons, type, palette,
// chrome, cursor), its own reactive effect and its own bubbles. Spots are lights in the painting: [x, y, radius, rgb].
export const THEMES = {
  aero: { name: 'Frutiger Aero', start: 'start', wall: 'hills', art: 'Green Hills', fx: 'bubbles', font: 'Baloo Da 2', spots: [], viz: ['#16b4ff', '#7ff1ff', '#c8ff6a', '#ffffff'] },
  vapor: { name: 'Vaporwave OS', start: 'START', wall: 'eye-vapor', art: 'Eye with a Tear', fx: 'vapor', font: 'Retro Stereo Wide', spots: [], viz: ['#b967ff', '#ff71ce', '#01cdfe', '#fffb96'] },
  baroque: { name: 'Baroque Keep', start: 'Enter', wall: 'clay', art: 'Clay Vase and Apple', fx: 'baroque', font: 'Dafont Baroque', spots: [[.72, .78, .2, '255,120,70']], viz: ['#5a0a14', '#a8202e', '#b8923a', '#f0d98a'] },
  ghost: { name: 'Ghost Net', start: 'JACK IN', wall: 'ghost', art: 'City Signs in the Rain', fx: 'ghost', font: 'Data Trash', spots: [[.5, .27, .14, '0,255,200'], [.5, .74, .1, '255,0,120']], viz: ['#00ffc8', '#00ffc8', '#fcee0a', '#ff003c'] },
  ray: { name: 'Ray OS', start: 'শুরু', wall: 'gold-ray', art: 'Gold Earrings', fx: 'ray', font: 'Dafont Ray', spots: [], viz: ['#5b4a3a', '#a8281d', '#d9c9a8', '#f4ecd8'] },
  metro: { name: 'Concrete Jungle', start: 'Uptown', wall: 'metro', art: 'Skyscrapers at Night', fx: 'metro', font: 'Alte Haas Grotesk', spots: [[.185, .74, .13, '255,205,120'], [.517, .74, .13, '255,205,120'], [.848, .74, .13, '255,205,120']], viz: ['#0039a6', '#ee352e', '#f7b500', '#ffffff'] },
};
export const SONGS = [
  { src: 'online-office', title: 'Online Office V4.20', artist: '', theme: 'aero' },
  { src: 'glowing-eyes', title: 'Glowing Eyes', artist: 'telepath', theme: 'vapor' },
  { src: 'musette-and-drums', title: 'Musette and Drums', artist: 'Cocteau Twins', theme: 'baroque' },
  { src: 'u-werent-here', title: "U Weren't Here I Really Miss You", artist: 'Cult Member', theme: 'ghost' },
  { src: 'ekta-meye', title: 'Ekta Meye', artist: 'Arnob', theme: 'ray' },
  { src: 'cities-in-dust', title: 'Cities in Dust', artist: 'Siouxsie and the Banshees', theme: 'metro' },
];
