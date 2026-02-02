import { useState , useEffect , useRef , useMemo} from 'react'
import ColorPicker from './components/colorpicker';
import Slider from './components/slider';
import './main.css';
import Dropdown from './components/dropdown';
import NumberInput from './components/NumberInput.jsx';
import AsciiPaletteInput from './components/asciipaletteinput';
import { ascii_rose,ascii_wire,ascii_title,ascii_rocket,aboutText } from './about';
import { DropZone } from './components/DropZone';
import { presets } from './presets';
import AsciiButton from './components/AsciiButton.jsx'
import {fill, writeCharacter, writeCharacterXY, drawCirclesAlongPath, drawFastVLine, fillCircle, fillCircleHelper, drawLine, drawBox} from './drawing.js'

function App() {
  const asciiPalettePresets = {
    symbols:`$@%&#*0/\\|()1{}[]?-_+~<>#!l;:,"^\`\'. `,
    full:'@MBHENR#KWXDFPQASUZbdehx*8Gm&04LOVYkpq5Tagns69owz$CIu23Jcfry%1v7l+it[]{}?j|()=~!-/<>\"^_\';,:`. ',
    letters:`BWMoahkbdpqwmZOQLCJUYXzcvunxrjftilI `
  };

  const debugCanvas = useRef({
    width:100,
    height:50,
    data:' '.padEnd(100*50)
  });
  const bufferCanvas = useRef(debugCanvas);

  function updateCanvas(canvas){
    document.getElementById('main-canvas').innerText = renderCanvas(canvas);
  }

  const imageLayer = useRef({
    data:'',
    width:undefined,
    height:undefined
  });
  const brushData = useRef({
    drawing:false,
    lastCoordinate:undefined
  });
  const shapeData = useRef({
    type : 'line',
    begun : false,
    moved : false,
    startIndex : 0,
    endIndex : 0,
  });

  const [currentChar,setCurrentChar] = useState('a');
  const currentCharRef = useRef(currentChar);
  useEffect(() => {
    currentCharRef.current = currentChar;
  },[currentChar]);

  const [activeCharIndex,setActiveCharIndex] = useState(0);
  const activeCharIndexRef = useRef(activeCharIndex);
  useEffect(() => {
    activeCharIndexRef.current = activeCharIndex;
  }, [activeCharIndex]);

  const [canvasDimensionSliders,setCanvasDimensionSliders] = useState({width:debugCanvas.current.width,height:debugCanvas.current.height});
  const canvasDimensionSlidersRef = useRef(canvasDimensionSliders);
  useEffect(() => {
    canvasDimensionSlidersRef.current = canvasDimensionSliders;
  },[canvasDimensionSliders]);

  const fontOptions = [
    {
      title:'default monospace',
      cssName:'monospace',
    },
    {
      title:'Courier New',
      cssName:'Courier New',
    },
    {
      title:'Syne Mono',
      cssName:'Syne Mono'
    },
    {
      title:'Bytesized',
      cssName:'Bytesized'
    },
    {
      title:'Workbench',
      cssName:'Workbench'
    }
  ];

  const [settings,setSettings] = useState({
    backgroundColor:'#ffffffff',
    textColor:'#0000ffff',
    cornerCharacter:'*',
    sideCharacter:'|',
    topCharacter:'-',
    fontSize:12,
    textSpacing:0,
    lineHeight:1.15,
    textSelectable:false,
    drawingMode:'brush',
    showAbout:false,
    blendTransparentAreas:true,
    advanceWhenCharacterEntered:true,
    useDynamicBrush:false,
    font:fontOptions[0].cssName,
    fillLineByDirection:false,
    brushSize : 1,
    drawFromClipboard : false,
    shapeType:'line',
    boxCharacters:{
      topL:'*',
      top:'-',
      topR:'*',
      sideL:'|',
      fill:'',
      sideR:'|',
      bottomL:'*',
      bottom:'-',
      bottomR:'*'
    },
    showCrosshairs:false,
    showGrid:false
  });

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    setMinimap();
  },[settings]);

  const [selectionBox,setSelectionBox] = useState({
    started : false,
    finished : false,
    startCoord : {x:0,y:0},
    endCoord : {x:0,y:0},
    movingText : false,
    moveBy : {x:0,y:0}
  });
  const selectionBoxRef = useRef(selectionBox);
  useEffect(() => {
    selectionBoxRef.current = selectionBox;
  },[selectionBox]);

  //stored as data,width,height
  const [clipboard,setClipboard] = useState(undefined);
  const clipboardRef = useRef(clipboard);
  useEffect(()=>{
    clipboardRef.current = clipboard;
  },[clipboard]);

  const [imageRenderer,setImageRenderer] = useState(
    {
      imageLoaded:false,
      width:0,
      height:0,
      fit: 'fill',
      gamma:1.0,
      contrast:1.0,
      imageSrc:null,
      technique:'characters',
      wordRenderStyle:'unbroken',
      asciiPalette:asciiPalettePresets['full'],
      wordList : ['type','words','here','!']
    }
  );
  const imageRendererRef = useRef(imageRenderer);
  useEffect(() => { 
    imageRendererRef.current = imageRenderer;
    //if the image is loaded
    if(imageRenderer.imageLoaded){
      loadImageForRendering(imageRenderer.imageSrc);
    }
  },[imageRenderer]);

  const [backgroundImage,setBackgroundImage] = useState({
    imageSrc:null,
    width:null,
    height:null,
    shown:true,
    scale:1.0,
    opacity: 0.8,
    type : 'image',
    leftCoord:0,
    topCoord:0
  });

  const backgroundImageRef = useRef(backgroundImage);
  useEffect(() => { 
    backgroundImageRef.current = backgroundImage;
  },[backgroundImage]);

  const [mouseCoords,setMouseCoords] = useState(null);
  const [asciiPalettePreset,setAsciiPalettePreset] = useState('full');
  const [viewWindow,setViewWindow] = useState({
    startX : 0,
    startY : 0,
    totalWidth : debugCanvas.current.width,
    totalHeight : debugCanvas.current.height,
    viewWidth : debugCanvas.current.width,
    viewHeight : debugCanvas.current.height
  });

  //add keypress event handlers, but only once
  useEffect(() => {
    updateCanvas();
    window.document.addEventListener('keydown', handleKeyPress);
    return () => {
      window.document.removeEventListener('keydown', handleKeyPress);
    }
  }, []);

  const undoBuffer = useRef([]);
  const redoBuffer = useRef([]);
  
  function pushUndoState(){
    //if the buffer gets long enough, start removing early entries
    if(undoBuffer.current.length > 200){
      undoBuffer.current.shift();
    }
    undoBuffer.current.push({
      canvasData:debugCanvas.current.data,
      canvasWidth:debugCanvas.current.width,
      canvasHeight:debugCanvas.current.height,
      currentChar:currentCharRef.current,
      activeCharIndex:activeCharIndexRef.current
    });
    //adding to the undo buffer resets the redo buffer
    redoBuffer.current = [];
  }
  
  function undo(){
    if(undoBuffer.current.length === 0)
      return;
    const previousState = undoBuffer.current.pop();
    redoBuffer.current.push({
      canvasData:debugCanvas.current.data,
      canvasWidth:debugCanvas.current.width,
      canvasHeight:debugCanvas.current.height,
      currentChar:currentCharRef.current,
      activeCharIndex:activeCharIndexRef.current
    });
    restoreState(previousState);
  }
  
  function redo(){
    if(redoBuffer.current.length === 0)
      return;
    const nextState = redoBuffer.current.pop();
    undoBuffer.current.push({
      canvasData:debugCanvas.current.data,
      canvasWidth:debugCanvas.current.width,
      canvasHeight:debugCanvas.current.height,
      currentChar:currentCharRef.current,
      activeCharIndex:activeCharIndexRef.current
    });
    restoreState(nextState);
  }

  function restoreState(state){
    debugCanvas.current = {data:state.canvasData,width:state.canvasWidth,height:state.canvasHeight};
    updateCanvas();
    setActiveCharIndex(state.activeCharIndex);
    setCurrentChar(state.currentChar);
  }

  function setMinimap(){
    const container = document.getElementById('canvas-view-window');
    const canvas = document.getElementById('main-canvas');

    //total dimensions
    let w = canvas.scrollWidth;
    let h = canvas.scrollHeight;
    const aR = canvas.scrollHeight/canvas.scrollWidth;
    const maxDim = 150;
    if(w > h){
      w = maxDim;
      h = aR * w;
    }
    else{
      h = maxDim;
      w = h / aR;
    }
    const scale = w / canvas.scrollWidth;

    // view dimensions
    const viewWidth = Math.min(container.clientWidth,canvas.clientWidth) * scale;
    const viewHeight = Math.min(container.clientHeight,canvas.clientHeight) * scale;
    
    //view offset 
    const viewOffset = {x:container.scrollLeft/container.scrollWidth * w,y:container.scrollTop/container.scrollHeight * h};

    setViewWindow({
      startX : viewOffset.x,
      startY : viewOffset.y,
      totalWidth : w,
      totalHeight : h,
      viewWidth : viewWidth,
      viewHeight : viewHeight
    });
  }

  function downloadCanvas(canvas,options){
    let string = canvas.data;
    if(options.linebreaks){
      string = addLineBreaksToText(canvas);
    }
    else{
      string = canvas.data;
    }
    if(options.escaped){
      string = escapeTextData(string);
    }
    if(options.asConst){
      string = `//sketch ${canvas.width} x ${canvas.height}\nconst sketch = {\n\twidth:${canvas.width},\n\theight:${canvas.height},\n\tdata:'${string}'\n};`;
    }
    const blob = new Blob([string],{type:'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "sketch.txt";
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }

  function map_range(value, low1, high1, low2, high2) {
    return low2 + (high2 - low2) * (value - low1) / (high1 - low1);
  }

  function copyText(canvas,options){
    //if there's a selection box, copy from that instead
    const selBox = selectionBoxRef.current;
    if(selBox.finished){
      const topL = {x:Math.min(selBox.startCoord.x,selBox.endCoord.x),y:Math.min(selBox.startCoord.y,selBox.endCoord.y)};
      const bottomR = {x:Math.max(selBox.startCoord.x,selBox.endCoord.x),y:Math.max(selBox.startCoord.y,selBox.endCoord.y)};
      canvas = copyArea(selBox.startCoord,selBox.endCoord,canvas);
      canvas.width = bottomR.x-topL.x;
      canvas.height = bottomR.y-topL.y;
    }
    let processedText = canvas.data;
    if(options.linebreaks)
      processedText = addLineBreaksToText({data:processedText,width:canvas.width,height:canvas.height});
    if(options.escaped)
      processedText = escapeTextData(processedText);
    setClipboard(canvas);
    navigator.clipboard.writeText(processedText);
  }

  function cutText(data,dimensions){
    const selection = selectionBoxRef.current;
    let startCoord = {x:0,y:0};
    let endCoord = {x:0,y:0};
    if(selection.finished){
      const topL = {x:Math.min(selection.startCoord.x,selection.endCoord.x),y:Math.min(selection.startCoord.y,selection.endCoord.y)};
      const bottomR = {x:Math.max(selection.startCoord.x,selection.endCoord.x),y:Math.max(selection.startCoord.y,selection.endCoord.y)};
      startCoord = topL;
      endCoord = bottomR;
    }
    else{
      return;
    }
    const cutResult = cutAreaAndFill(startCoord,endCoord,data,dimensions.width,' ',false);
    const text = cutResult.data;
    let cut = cutResult.cutData.data;
    debugCanvas.current = {...debugCanvas.current,data:text};
    updateCanvas();
    setClipboard({data: cut,width:cutResult.cutData.width,height:cutResult.cutData.height});
    navigator.clipboard.writeText(cut);
  }

  function escapeTextData(data){
    //u need to handle: ` ' " and \
    //first, \, but ignore \n characters (since those aren't typeable, and will only ever be a part of the canvas formatting)
    data = data.replace(/\\(?!n)/g, '\\\\');
    //then, `
    data = data.replace(/\`/g, '\\`');
    //then, '
    data = data.replace(/\'/g, '\\\'');
    //then, "
    data = data.replace(/\"/g, '\\"');
    return data;
  }

  function calculateWordBrightness(word){
    const gradient = '@MBHENR#KWXDFPQASUZbdehx*8Gm&04LOVYkpq5Tagns69owz$CIu23Jcfry%1v7l+it[]{}?j|()=~!-/<>\"^_\';,:`. ';
    let avgScore = 0;
    for(let i = 0; i<word.length; i++){
      const char = word.charAt(i);
      let index = gradient.indexOf(char);
      if(index == -1)
        console.log('uh oh!');
      else
        avgScore += (index/gradient.length);
    }
    return (avgScore/word.length);
  }

  function renderImageAsAscii(img){
    
    const fit = imageRendererRef.current.fit;

    let width,height;
    if(fit == 'fill'){
      width = debugCanvas.current.width;
      height = debugCanvas.current.height;
    }
    else if(fit == 'width'){
      width = debugCanvas.current.width;
      height = Math.round(width * img.height/img.width);
    }
    else if(fit == 'height'){
      height = debugCanvas.current.height;
      width = Math.round(height * img.width/img.height);
    }

    const outputDimensions = {
      width:width,
      height:height
    };

    const palette = imageRenderer.asciiPalette;

    // prepare wordlist
    let wordList = [];
    if(imageRenderer.technique == 'words'){
      wordList = imageRenderer.wordList.toSorted((a,b) => {
        let scoreA = calculateWordBrightness(a);
        let scoreB = calculateWordBrightness(b)
        return scoreA-scoreB;
      });
      if(!wordList || wordList.length == 0){
        let warningString = '[no word palette to raster with!]';
        warningString = warningString.padEnd(outputDimensions.width*outputDimensions.height,' ');
        imageLayer.current = {data:warningString,...outputDimensions};
        return;
      }
    }
    else if(palette.length == 0){
      let warningString = '[no character palette to raster with!]';
      warningString = warningString.padEnd(outputDimensions.width*outputDimensions.height,' ');
      imageLayer.current = {data:warningString,...outputDimensions};
      return;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    let newStr = '';
    //load image onto canvas
    canvas.width = outputDimensions.width;
    canvas.height = outputDimensions.height;
    ctx.drawImage(img,0,0,canvas.width,canvas.height);

    //get pixel data from canvas
    let pixelData = ctx.getImageData(0,0,canvas.width,canvas.height,{pixelFormat:"rgba-unorm8"});
    let lastUsedWord = null;
    let indexOfLastStart = 0;
    for(let px = 0; px<pixelData.data.length; px+=4){
      
      const redChannel = pixelData.data[px];
      const greenChannel = pixelData.data[px+1];
      const blueChannel = pixelData.data[px+2];
      const alphaChannel = pixelData.data[px+3];


      // https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Pixel_manipulation_with_canvas
      let grayscaleValue = (0.299*redChannel + 0.587*greenChannel + 0.114*blueChannel) * (alphaChannel/255) + (1.0 - alphaChannel/255)*255;

      //gamma
      grayscaleValue = Math.pow(grayscaleValue/255,imageRenderer.gamma)*255;
      //contrast
      const intercept = 128 * (1 - imageRenderer.contrast);
      grayscaleValue = Math.max(Math.min((grayscaleValue*imageRenderer.contrast) + intercept,255),0);
      
      if(imageRenderer.technique == 'characters'){
        const paletteIndex = map_range(grayscaleValue,0,255,0,palette.length-1);
        newStr+= palette.charAt(paletteIndex);
      }
      else if(imageRenderer.technique == 'words'){
        const whichWord = wordList[Math.round(map_range(grayscaleValue,0,255,0,wordList.length-1))];
        const charIndex = (Math.trunc((px-indexOfLastStart)/4)%canvas.width)%whichWord.length;
        const lastWordCharIndex = lastUsedWord?(Math.trunc((px-indexOfLastStart)/4)%canvas.width)%lastUsedWord.length:0;
        let whichCharacter = whichWord.charAt(charIndex);
        //if you're continuing on the last word, don't worry about if it's already started
        if(imageRenderer.wordRenderStyle == 'unbroken'){
          if(lastUsedWord == whichWord){
            newStr += (whichCharacter=='')?' ':whichCharacter;
          }
          //if the previous word starts/ends here, start the new word
          else if(lastWordCharIndex == 0){
            lastUsedWord = whichWord;
            whichCharacter = whichWord.charAt(0);
            newStr += (whichCharacter=='')?' ':whichCharacter;
            indexOfLastStart = px;
          }
          //if not, then keep going with the last word
          else{
            whichCharacter = lastUsedWord.charAt(lastWordCharIndex);
            newStr += (whichCharacter=='')?' ':whichCharacter;
          }
        }
        else if(imageRenderer.wordRenderStyle == 'break words'){
          //if you're continuing on the last word, don't worry about if it's already started
          if(lastUsedWord == whichWord){
            newStr += (whichCharacter=='')?' ':whichCharacter;
          }
          else{
            lastUsedWord = whichWord;
            if(charIndex == 0){
              newStr += (whichCharacter=='')?' ':whichCharacter;
              indexOfLastStart = px;
            }
            else newStr += ' ';
          }
        }
      }
    }
    imageLayer.current = {...outputDimensions,data:newStr};
  };

  function loadImageForRendering(src){
    if(typeof src === "string"){
      const img = new Image;
      img.onload = function() {
        renderImageAsAscii(this);
        updateCanvas();
        delete this;
      };
      img.src = src;
    }
  }
  function overlayImageOnCanvas(){
    let canvasString = '';
    for(let ch = 0; ch < debugCanvas.current.data.length; ch++){
      const coords = {x : ch%debugCanvas.current.width, y : Math.trunc(ch / debugCanvas.current.width)};
      const char = debugCanvas.current.data.charAt(ch);
      if(char === ' ' && coords.x < imageLayer.current.width && coords.y < imageLayer.current.height){
        const imageLayerIndex = coords.x + coords.y * imageLayer.current.width;
        if(imageLayerIndex < imageLayer.current.data.length)
          canvasString += imageLayer.current.data.charAt(imageLayerIndex);
      }
      else{
        canvasString += char;
      }
    }
    return canvasString;
  }

  const redrawPlayer = useRef({
    currentIndex : 0,
    currentCanvas : undefined,
    fallbackIndex : 0
  });

  const presetsToDraw = ['barbed wire','big star','star portrait','rose','missile','house'];

  function animateRedraw(){
    if(redrawPlayer.current.playing)
      redrawPlayer.current.playing = false;
    else{
      redrawPlayer.current = {
        currentIndex : 0,
        currentPreset : 0,
        playing:true,
        fallbackIndex : 0,
        currentCanvas : {...debugCanvas.current,data:' '.padEnd(debugCanvas.current.data.length,' ')}
      }
      drawNext();
    }
  }

  function drawNext(){
    const targetChar = debugCanvas.current.data.charAt(redrawPlayer.current.currentIndex);
    redrawPlayer.current.currentCanvas.data = writeCharacter(redrawPlayer.current.currentIndex,targetChar,redrawPlayer.current.currentCanvas);
    const next = seekNextCharToDraw();
    if(redrawPlayer.current.restarted){
      redrawPlayer.current.restarted = false;
      loadPreset(presetsToDraw[redrawPlayer.current.currentPreset]);
      redrawPlayer.current.currentCanvas = {...debugCanvas.current,data:' '.padEnd(debugCanvas.current.data.length,' ')};
    }
    if(redrawPlayer.current.playing == false){
      updateCanvas();
      return;
    }
    if(next === false){
      // redrawPlayer.current.currentPreset++;
      // redrawPlayer.current.currentPreset%=presetsToDraw.length;
      //restart
      redrawPlayer.current = {
        // restarted:true,
        currentPreset : redrawPlayer.current.currentPreset,
        currentIndex : 0,
        playing:true,
        fallbackIndex : 0,
        currentCanvas : {...debugCanvas.current,data:' '.padEnd(debugCanvas.current.data.length,' ')}
      }
      setTimeout(drawNext,1000);
    }
    else{
      redrawPlayer.current.currentIndex = next;
      setActiveCharIndex(redrawPlayer.current.currentIndex);
      setMouseCoords({x:redrawPlayer.current.currentIndex%redrawPlayer.current.currentCanvas.width,y:Math.floor(redrawPlayer.current.currentIndex/redrawPlayer.current.currentCanvas.width)});
      setCurrentChar(targetChar);
      setTimeout(drawNext,50);
      updateCanvas(redrawPlayer.current.currentCanvas);
    }
  }

  function seekNextCharToDraw(){
    //search 8 adjacent spaces (up, topR, right, bottomR, down)
    const coords = [{x:0,y:-1},{x:1,y:-1},{x:1,y:0},{x:1,y:1},{x:0,y:1},{x:-1,y:1},{x:-1,y:0},{x:-1,y:-1}];
    for(let coord of coords){
      const index = redrawPlayer.current.currentIndex + coord.x + coord.y * redrawPlayer.current.currentCanvas.width;
      if(index < debugCanvas.current.data.length - 1){
        const currentChar = redrawPlayer.current.currentCanvas.data.charAt(index);
        const targetChar = debugCanvas.current.data.charAt(index);
        if(currentChar != targetChar)
          return index;
      }
    }
    //if you didn't find one, use the fallback index
    let fallbackChar = redrawPlayer.current.currentCanvas.data.charAt(redrawPlayer.current.fallbackIndex);
    let targetChar = debugCanvas.current.data.charAt(redrawPlayer.current.fallbackIndex);
    while(fallbackChar == targetChar){
      redrawPlayer.current.fallbackIndex++;
      if(redrawPlayer.current.fallbackIndex >= debugCanvas.current.data.length)
        return false;
      fallbackChar = redrawPlayer.current.currentCanvas.data.charAt(redrawPlayer.current.fallbackIndex);
      targetChar = debugCanvas.current.data.charAt(redrawPlayer.current.fallbackIndex);
    }
    return redrawPlayer.current.fallbackIndex;
  }

  function renderCanvas(canvas){
    if(!canvas)
      canvas = debugCanvas.current;
    let canvasString = '';
    //if there's an image, overlay the canvas on top of it
    if(imageLayer.current.data && imageRendererRef.current.imageLoaded){
      canvasString = overlayImageOnCanvas();
    }
    else{
      canvasString = canvas.data;
    }
    return addLineBreaksToText({data:canvasString,width:canvas.width,height:canvas.height});
  }

  function createBackground(canvas){
    const sideCharacter = settingsRef.current.sideCharacter?settingsRef.current.sideCharacter:' ';
    const topCharacter = settingsRef.current.topCharacter?settingsRef.current.topCharacter:' ';
    const cornerCharacter = settingsRef.current.cornerCharacter?settingsRef.current.cornerCharacter:' ';

    let side = '';
    side = side.padStart(canvas.width,' ');
    side = sideCharacter+side+sideCharacter;
    let str = '';
    for(let i = 0; i<canvas.height; i++){
      str += side;
    }
    let top = '';
    top = top.padStart(canvas.width,topCharacter);
    top = cornerCharacter+top+cornerCharacter;
    return top+str+top;
  }

  function resizeCanvas(canvas,newDims){
    pushUndoState();
    const originalDims = {width:canvas.width,height:canvas.height};
    let newString = '';
    for(let r = 0; r<Math.min(originalDims.height,newDims.height); r++){
      //get the original row
      let rowString = canvas.data.substring(r*originalDims.width,(r+1)*originalDims.width);
      if(newDims.width<originalDims.width)
        rowString = rowString.substring(0,newDims.width);
      else
        rowString = rowString.padEnd(newDims.width,' ');
      newString += rowString;
    }
    newString = newString.padEnd(newDims.width*newDims.height,' ');
    return newString;
  }

  function startShape(index){
    shapeData.current = {
      ...shapeData.current,
      begun : true,
      moved : false,
      startIndex : index,
      endIndex : null,
    }
    //store a copy of div contents in buffer canvas, so you can draw arbitrary lines on top of canvas w/o loosing anything
    bufferCanvas.current = {...debugCanvas.current};
  }

  function endShape(endIndex){
    const start = {x:shapeData.current.startIndex%debugCanvas.current.width,y:Math.trunc(shapeData.current.startIndex/debugCanvas.current.width)};
    const end = {x:endIndex%debugCanvas.current.width,y:Math.trunc(endIndex/debugCanvas.current.width)};
    const char = settingsRef.current.fillLineByDirection?getLineDirectionalChar(start,end):currentChar;
    shapeData.current = {
      ...shapeData.current,
      begun : false,
      moved : false,
      endIndex : endIndex,
    };
    let temp;
    switch(shapeData.current.type){
      case 'line':
        temp = drawLine(settingsRef.current.brushSize,start,end,char,{...bufferCanvas.current});
        break;
      case 'box':
        temp = drawBox(start,end,settingsRef.current.boxCharacters,{...bufferCanvas.current});
        break;
    }
    debugCanvas.current = {...debugCanvas.current,data:temp};
    bufferCanvas.current = {...debugCanvas.current};
    updateCanvas();
  }

  function getClickIndex(e){
    const coords = getTruncatedClickCoords(e);
    return coords.x+debugCanvas.current.width*coords.y;
  }
  function getClickCoords(e){
    const dims = e.target.getBoundingClientRect();
    const clickCoords = {
      x:e.clientX - dims.left,
      y:e.clientY - dims.top
    };
    //px per char
    const characterDims = {
      width : dims.width / debugCanvas.current.width,
      height : dims.height / debugCanvas.current.height,
    };

    return {x: clickCoords.x/characterDims.width,y:clickCoords.y/characterDims.height};
  }
  function getTruncatedClickCoords(e){
    const coords = getClickCoords(e);
    return {x:Math.max(Math.floor(coords.x),0),y:Math.max(Math.floor(coords.y),0)};
  }
  function getRoundedClickCoords(e){
    const coords = getClickCoords(e);
    return {x:Math.min(Math.round(coords.x),debugCanvas.current.width),y:Math.min(Math.round(coords.y),debugCanvas.current.height)};
  }
  function getWordListAsLineBreakString(words){
    let string = '';
    for(let w = 0; w<words.length; w++){
      string+=(w<words.length-1)?(words[w]+'\n'):words[w];
    }
    return string
  }
  function getWordListFromLineBreakString(e){
    let words = e.target.value.split('\n');
    return words;
  }

  function handleMouseLeave(e){
    setMouseCoords(null);
  }

  function getSelectionBoxEndCoords(e,startCoord){
    if(!startCoord)
      startCoord = selectionBoxRef.current.startCoord;
    let coords = getClickCoords(e);
    const w = coords.x - startCoord.x;
    const h = coords.y - startCoord.y;
    if(Math.abs(w) < 1)
      coords.x = startCoord.x+((w<0)?-1:1);
    if(Math.abs(h) < 1)
      coords.y = startCoord.y+((h<0)?-1:1);
    return {x:Math.round(coords.x),y:Math.round(coords.y)};
  }

  function handleMouseUp(e){

    //set the cursor on the index where the mouse was released
    setActiveCharIndex(getClickIndex(e));

    switch(settings.drawingMode){
      case 'shape':
        const newIndex = getClickIndex(e);
        //if you already started a shape
        if(shapeData.current.begun){
          if(shapeData.current.moved){
            endShape(newIndex);
          }
          else{
            shapeData.current = {
              ...shapeData.current,
              begun : false,
              moved : false,
              startIndex : shapeData.current.startIndex,
              endIndex : null,
            };
          }
        }
        break;
      case 'brush':
        brushData.current = {
          drawing:false,
          lastCoordinate:undefined
        };
        break;
    }
    //changing the selectionbox
    if(selectionBox.started){
      const newBox = {...selectionBoxRef.current,
        started : false,
        finished : true,
        endCoord : {...getSelectionBoxEndCoords(e)},
        movingText : false,
        moveBy : {x:0,y:0}
      };
      setSelectionBox(newBox);
    }
    //if you're done selecting, apply the transformation u set
    else if(selectionBox.finished){
      const newBox = {...selectionBox,
        started : false,
        finished : true,
        movingText : false,
        moveBy:{x:0,y:0},
        startCoord : {x:selectionBox.startCoord.x+selectionBox.moveBy.x,y:selectionBox.startCoord.y+selectionBox.moveBy.y},
        endCoord : {x:selectionBox.endCoord.x+selectionBox.moveBy.x,y:selectionBox.endCoord.y+selectionBox.moveBy.y}
      };
      setSelectionBox(newBox);
    }
  }

  function handleMouseDown(e){
    setActiveCharIndex(getClickIndex(e));
    //moving selectionbox
    if(selectionBox.finished){
      const coords = getRoundedClickCoords(e);
      const topL = {x:Math.min(selectionBox.startCoord.x,selectionBox.endCoord.x)+selectionBox.moveBy.x,y:Math.min(selectionBox.startCoord.y,selectionBox.endCoord.y)+selectionBox.moveBy.y};
      const bottomR = {x:Math.max(selectionBox.startCoord.x,selectionBox.endCoord.x)+selectionBox.moveBy.x,y:Math.max(selectionBox.startCoord.y,selectionBox.endCoord.y)+selectionBox.moveBy.y};
      if(coords.x < bottomR.x && coords.x > topL.x && coords.y < bottomR.y && coords.y > topL.y){
        const newBox = {
          started : false,
          finished : true,
          startCoord : selectionBox.startCoord,
          endCoord : selectionBox.endCoord,
          movingText : true,
          moveBy : selectionBox.moveBy
        };
        setSelectionBox(newBox);
        //store this version of div contents
        if(selectionBox.moveBy.x || selectionBox.moveBy.y){

        }
        else{
          bufferCanvas.current = {...debugCanvas.current};
          pushUndoState();
        }
        return;
      }
    }
    //starting selectionbox
    if(e.shiftKey && !settingsRef.current.textSelectable){
      const coords = getTruncatedClickCoords(e);
      const newBox = {
        started : true,
        finished : false,
        startCoord : {...coords},
        endCoord : {...getSelectionBoxEndCoords(e,coords)},
        movingText : false,
        moveBy : {x:0,y:0}
      };
      setSelectionBox(newBox);
      //store this version of div contents
      bufferCanvas.current = {...debugCanvas.current};
    }
    else{
      const newIndex = getClickIndex(e);
      const coords = getTruncatedClickCoords(e);
      pushUndoState();
      switch(settings.drawingMode){
        case 'shape':
          //start drawing a line
          startShape(newIndex);
          break;
        case 'brush':
          if(settingsRef.current.drawFromClipboard){
            if(clipboardRef.current){
              brushData.current = {
                drawing:true,
                lastCoordinate:coords
              };
              const location = {x:Math.round(coords.x-clipboardRef.current.width/2),y:Math.round(coords.y-clipboardRef.current.height/2)};
              debugCanvas.current = {...debugCanvas.current,data:pasteText(clipboardRef.current.data,clipboardRef.current,location,debugCanvas.current)};
              updateCanvas();
            }
          }
          else{
            // don't draw a character yet, until the mouse is moved
            brushData.current = {
              drawing:true,
              lastCoordinate:coords
            };
          }
          break;
        case 'fill':
          //pattern fill
          if(settingsRef.current.drawFromClipboard){
            if(clipboardRef.current)
              debugCanvas.current = {...debugCanvas.current,data:fill(coords.x,coords.y,clipboardRef.current,debugCanvas.current)};
          }
          //normal fill
          else{
            debugCanvas.current = {...debugCanvas.current,data:fill(coords.x,coords.y,currentCharRef.current,debugCanvas.current)};
          }
          updateCanvas();
          break;
      }
      //cancel the selection box, if there was one
      const newBox = {
        started : false,
        finished : false,
        startCoord : getRoundedClickCoords(e),
        endCoord : getRoundedClickCoords(e),
        movingText : false,
        moveBy : {x:0,y:0}
      };
      setSelectionBox(newBox);
    }
  }
  function handleMouseMove(e){
    const newIndex = getClickIndex(e);
    const canvDims = debugCanvas.current;
    const coords = getTruncatedClickCoords(e);
    setMouseCoords({...coords});
    switch(settings.drawingMode){
      case 'shape':
        //changing line position
        if(shapeData.current.begun){
          //if the index didn't change, you haven't moved
          if(newIndex === shapeData.current.startIndex){
            return;
          }
          const start = {x:shapeData.current.startIndex%debugCanvas.current.width,y:Math.trunc(shapeData.current.startIndex/debugCanvas.current.width)};          
          shapeData.current = {
            ...shapeData.current,
            begun : true,
            moved : true,
            endIndex : newIndex,
          };
          let temp;
          switch(shapeData.current.type){
            case 'line':
              temp = drawLine(settingsRef.current.brushSize,start,coords,settingsRef.current.fillLineByDirection?getLineDirectionalChar(start,coords):currentChar,{...bufferCanvas.current});
              break;
            case 'box':
              temp = drawBox(start,coords,settingsRef.current.boxCharacters,{...bufferCanvas.current});
              break;
          }
          debugCanvas.current = {...debugCanvas.current,data:temp};
          updateCanvas();
        }
        break;
      case 'brush':
        if(brushData.current.drawing){
          if(settingsRef.current.drawFromClipboard){
            if(clipboardRef.current){
              const location = {x:Math.round(coords.x-clipboardRef.current.width/2),y:Math.round(coords.y-clipboardRef.current.height/2)};
              debugCanvas.current = {...debugCanvas.current,data:pasteText(clipboardRef.current.data,clipboardRef.current,location,debugCanvas.current)};
              updateCanvas();
            }
          }
          else{
            let brushSize = settingsRef.current.brushSize;
            if(brushData.current.lastCoordinate !== undefined && settingsRef.current.useDynamicBrush){
              const distX = brushData.current.lastCoordinate.x - coords.x;
              const distY = brushData.current.lastCoordinate.y - coords.y;
              //usually, dist is between 1 and 2
              const distance = Math.sqrt((distX*distX)+(distY*distY));
              //map distance to a thickness (from 0, brushSize)
              brushSize = Math.max(Math.trunc(map_range(distance,0,20,brushSize,1)),0);
            }
            //if there's no other coordinate, just fill circles
            if(brushData.current.lastCoordinate === undefined){
              debugCanvas.current = {...debugCanvas.current,data:fillCircle(coords.x,coords.y,brushSize-1,currentChar,debugCanvas.current)};
              updateCanvas();
            }
            else{
              debugCanvas.current = {...debugCanvas.current,data:drawCirclesAlongPath({x:brushData.current.lastCoordinate.x,y:brushData.current.lastCoordinate.y},{x:coords.x,y:coords.y},brushSize-1,currentChar,debugCanvas.current)};
              updateCanvas();
            }
            brushData.current = {
              drawing:true,
              lastCoordinate:coords
            };
          }
        }
        break;
      case 'fill':
        if(e.buttons && !e.shiftKey){
          //pattern fill
          if(settingsRef.current.drawFromClipboard){
            if(clipboardRef.current)
              debugCanvas.current = {...debugCanvas.current,data:fill(coords.x,coords.y,clipboardRef.current,debugCanvas.current)};
          }
          //normal fill
          else{
            debugCanvas.current = {...debugCanvas.current,data:fill(coords.x,coords.y,currentCharRef.current,debugCanvas.current)};
          }
          updateCanvas();
        }
        break;
    }
    //changing selbox
    if(selectionBox.started){
      let newBox;
      //extend selbox
      if(e.shiftKey){
        newBox = {...selectionBoxRef.current,
          started : true,
          finished : false,
          endCoord : {...getSelectionBoxEndCoords(e)},
          movingText : false,
        };
      }
      //cancel it
      else{
        newBox = {
          started : false,
          finished : false,
          startCoord : selectionBox.startCoord,
          endCoord : getRoundedClickCoords(e),
          movingText : false,
          moveBy : {x:selectionBox.moveBy.x,y:selectionBox.moveBy.y}
        };
      }
      setSelectionBox(newBox);
    }
    //moving/shifting area
    else if(selectionBox.movingText){
      const coords = getTruncatedClickCoords(e);
      const selBoxDims = {width:Math.abs(selectionBox.endCoord.x-selectionBox.startCoord.x),height:Math.abs(selectionBox.endCoord.y-selectionBox.startCoord.y)};
      
      //no fractional coordinates! adjust coords so the selbox is moved relative to where the mouse was pressed
      const topL = {x:Math.min(selectionBox.startCoord.x,selectionBox.endCoord.x),y:Math.min(selectionBox.startCoord.y,selectionBox.endCoord.y)};
      // const bottomR = {x:Math.max(selectionBox.startCoord.x,selectionBox.endCoord.x),y:Math.max(selectionBox.startCoord.y,selectionBox.endCoord.y)};
      const moveBy = {
        x: Math.trunc(coords.x - topL.x - selBoxDims.width/2),
        y: Math.trunc(coords.y - topL.y - selBoxDims.height/2)
      }
      const newBox = {
          started : false,
          finished : true,
          startCoord : selectionBox.startCoord,
          endCoord : selectionBox.endCoord,
          movingText : true,
          moveBy : moveBy
      };
      setSelectionBox(newBox);
      debugCanvas.current = {...debugCanvas.current,data:shiftArea(newBox,newBox.moveBy,bufferCanvas.current.data,debugCanvas.current.width,true)};
      updateCanvas();
    }
  }

  function shiftCharacters(index,amount,data){
    let insertStr = '';
    const rowStartIndex = Math.trunc(index/debugCanvas.current.width)*(debugCanvas.current.width);
    const moveAmt = Math.min(amount<0?(debugCanvas.current.width - index%debugCanvas.current.width):(debugCanvas.current.width - (index%debugCanvas.current.width)),Math.abs(amount));
    for(let i = 0; i<moveAmt; i++){
      insertStr += ' ';
    }
    if(amount<0){
      debugCanvas.current = {...debugCanvas.current,data:data.substring(0,index)+data.substring(index+moveAmt,rowStartIndex+debugCanvas.current.width)+insertStr+data.substring(rowStartIndex+debugCanvas.current.width)};
    }
    else{
      debugCanvas.current = {...debugCanvas.current,data:data.substring(0,index)+insertStr+data.substring(index,rowStartIndex+debugCanvas.current.width-moveAmt)+data.substring(rowStartIndex+debugCanvas.current.width)};
    }
    updateCanvas();
  }

  function newLine(index,amount,data){
    const rowStartIndex = Math.trunc(index/debugCanvas.current.width)*(debugCanvas.current.width);
    let insertStr = '';
    for(let i = 0; i<debugCanvas.current.width; i++){
      insertStr += ' ';
    }
    const moveAmt = Math.min(amount>0?debugCanvas.current.height:(rowStartIndex/debugCanvas.current.width),Math.abs(amount))
    if(amount>0){
      for(let i = 0; i<moveAmt; i++){
        debugCanvas.current = {...debugCanvas.current,data:data.substring(0,rowStartIndex)+insertStr+data.substring(rowStartIndex,data.length-debugCanvas.current.width*moveAmt)};
      }
    }
    else{
      for(let i = 0; i<moveAmt; i++){
        debugCanvas.current = {...debugCanvas.current,data:data.substring(0,rowStartIndex)+data.substring(rowStartIndex+debugCanvas.current.width*moveAmt)+insertStr};
      }
    }
    updateCanvas();
  }

  function moveColumn(index,amount,data){
    const rowIndex = Math.trunc(index/debugCanvas.current.width);
    const colIndex = index % debugCanvas.current.width;
    if(amount>0){
      for(let i = (debugCanvas.current.height); i>rowIndex; i--){
        data = writeCharacter(i*debugCanvas.current.width+colIndex,data.charAt((i-1)*debugCanvas.current.width+colIndex),data);
      }
      data = writeCharacter(rowIndex*debugCanvas.current.width+colIndex,' ');
    }
    else{
      for(let i = rowIndex; i<(debugCanvas.current.height-1); i++){
        data = writeCharacter(i*debugCanvas.current.width+colIndex,data.charAt((i+1)*debugCanvas.current.width+colIndex),data);
      }
    }
    debugCanvas.current = {...debugCanvas.current,data:data};
    updateCanvas();
  }

  function copyArea(startCoord,endCoord,canvas){
    let tempData = canvas.data;
    let topL = {x:Math.min(startCoord.x,endCoord.x),y:Math.min(startCoord.y,endCoord.y)};
    let bottomR = {x:Math.max(startCoord.x,endCoord.x),y:Math.max(startCoord.y,endCoord.y)};
    let width = bottomR.x - topL.x;

    let copyStr = '';

    //for each row containing the cut, grab the part before, blank, and the part after
    for(let y = topL.y;y<bottomR.y;y++){
      const rowStart = canvas.width*y;
      const cutStart = rowStart+topL.x;
      const cutEnd = cutStart+width;
      const rowEnd = rowStart+canvas.width;
      copyStr += tempData.substring(cutStart,cutEnd);
    };
    //grab the rest of it
    return {data:copyStr,width : width, height: bottomR.y - topL.y};
  }

  function cutAreaAndFill(startCoord,endCoord,data,dataWidth,fillCharacter,preserveOriginalArea){
    let tempData = data;
    let topL = {x:Math.min(startCoord.x,endCoord.x),y:Math.min(startCoord.y,endCoord.y)};
    let bottomR = {x:Math.max(startCoord.x,endCoord.x),y:Math.max(startCoord.y,endCoord.y)};
    let width = bottomR.x - topL.x;

    let cutStr = '';
    let blankStr = '';
    let newStr = '';
    blankStr = blankStr.padStart(width,fillCharacter);

    //first bit (before the first row cut)
    newStr += tempData.substring(0,dataWidth*topL.y);
    //for each row containing the cut, grab the part before, blank, and the part after
    for(let y = topL.y;y<bottomR.y;y++){
      const rowStart = dataWidth*y;
      const cutStart = rowStart+topL.x;
      const cutEnd = cutStart+width;
      const rowEnd = rowStart+dataWidth;
      if(preserveOriginalArea){
        newStr += tempData.substring(rowStart,rowEnd);
      }
      else{
        newStr += tempData.substring(rowStart,cutStart)+blankStr+tempData.substring(cutEnd,rowEnd);
      }
      cutStr += tempData.substring(cutStart,cutEnd);
    };
    //grab the rest of it
    newStr += tempData.substring((bottomR.y) * dataWidth);
    return {data:newStr,cutData:{data:cutStr,width : width, height: bottomR.y - topL.y}};
  }

  function shiftArea(coords,direction,data,dataWidth,preserveOriginalArea){
    let topL = {x:Math.min(coords.startCoord.x,coords.endCoord.x),y:Math.min(coords.startCoord.y,coords.endCoord.y)};
    let bottomR = {x:Math.max(coords.startCoord.x,coords.endCoord.x),y:Math.max(coords.startCoord.y,coords.endCoord.y)};

    //checking bounds and clamping them to the canvas
    if(topL.x + direction.x < 0){
      direction.x = -topL.x;
    }
    else if(bottomR.x + direction.x > dataWidth){
      direction.x = dataWidth-bottomR.x;
    }
    if(topL.y + direction.y < 0){
      direction.y = -topL.y;
    }
    else if(bottomR.y + direction.y > data.length/dataWidth){
      direction.y = data.length/dataWidth-bottomR.y;
    }

    let newData = cutAreaAndFill(coords.startCoord,coords.endCoord,data,dataWidth,' ');
    newData.data = pasteText(newData.cutData.data,{width:newData.cutData.width,height:newData.cutData.height},{x:Math.min(coords.startCoord.x,coords.endCoord.x)+direction.x,y:Math.min(coords.startCoord.y,coords.endCoord.y)+direction.y},{data:newData.data,width:dataWidth,height:newData.data.length/dataWidth});
    return newData.data;
  }

  //this is glitching because it's always using the original selection box coords
  function checkMove(selection,direction,dimensions){
    let topL = {x:Math.min(selection.startCoord.x,selection.endCoord.x),y:Math.min(selection.startCoord.y,selection.endCoord.y)};
    let bottomR = {x:Math.max(selection.startCoord.x,selection.endCoord.x),y:Math.max(selection.startCoord.y,selection.endCoord.y)};
    if(((topL.x + direction.x + selection.moveBy.x) < 0) ||
       ((bottomR.x + direction.x + selection.moveBy.x) > dimensions.width) ||
       ((topL.y + direction.y + selection.moveBy.y) < 0) ||
       ((bottomR.y + direction.y + selection.moveBy.y) > dimensions.height)
    ){
      return false;
    }
    else{
      return true;
    }
  }

  function move(selection,direction,bufCanvas,canvDims){
    if((selection.started || selection.finished) && checkMove(selection,direction,canvDims)){
      const newCanv = shiftArea(selection,{x:selection.moveBy.x+direction.x,y:selection.moveBy.y+direction.y},bufCanvas,canvDims.width,true);
      debugCanvas.current = {...debugCanvas.current,data:newCanv};
      updateCanvas();
      setSelectionBox(
        {...selection,
          moveBy : {x:selection.moveBy.x+direction.x,y:selection.moveBy.y+direction.y}
        }
      );
      return true;
    }
    return false;
  }

  function clearCanvas(){
    pushUndoState();
    let canvasData=``;
    canvasData = canvasData.padStart(debugCanvas.current.height*debugCanvas.current.width,' ');
    debugCanvas.current = {...debugCanvas.current,data:canvasData};
    updateCanvas();
  }

  function handleKeyPress(e){

    /*
    This vv is for only triggering when the document is focused, so typing
    in the input boxes/outside the page doesn't trigger text entry.
    Enter key still works tho, so you can enter new canv dims
    */
    if(e.target === document.body || (e.target.className == 'number_input_box' && e.key == 'Enter')){
    }
    //u were focused elsewhere
    else{
      return;
    }

    if(settingsRef.textSelectable)
      return;

    //stop the event from bubbling, so this is only called once
    e.stopPropagation();
    e.preventDefault();

    //get fresh copies of the state data when this callback is fired
    const index = activeCharIndexRef.current;
    const activeChar = currentCharRef.current;
    let textData = debugCanvas.current.data;
    const line = shapeData.current;
    const bufCanvas = bufferCanvas.current;
    const selection = selectionBoxRef.current;
    const canvDims = debugCanvas.current;
    const canvDimSliders = canvasDimensionSlidersRef.current;
    const advanceOnPress = settingsRef.current.advanceWhenCharacterEntered;

    //janky way to see if it's a letter
    if(e.key.length === 1){
      if(e.metaKey){
        switch(e.key){
          case 'x':
            pushUndoState();
            cutText(textData,canvDims);
            return;
          case 'z':
            if(e.shiftKey)
              redo();
            else
              undo();
            return;
          case 'c':
            //copy text to clipboard
            copyText(debugCanvas.current,{escaped:false,linebreaks:true});
            return;
          case 'v':
            pushUndoState();
            pasteClipboardContents();
            return;
          //clear all with ctr+slash, ctrl+backspace is handled in backspace handler
          case '/':
          case '\\':
            pushUndoState();
            clearCanvas();
            return;
          case 'a':
            if(e.shiftKey){
              setSelectionBox({
                started : false,
                finished : false,
                startCoord : {x:0,y:0},
                endCoord : {x:0,y:0},
                movingText : false,
                moveBy : {x:0,y:0}
              });
            }
            else{
              setSelectionBox({
                started : false,
                finished : true,
                startCoord : {x:0,y:0},
                endCoord : {x:canvDims.width,y:canvDims.height},
                movingText : false,
                moveBy : {x:0,y:0}
              });
            }
            return;
        }
      }
      
      if(e.key == ' '){

      }
      switch(settingsRef.current.drawingMode){
        case 'type':
        // case 'stamp':
        // case 'brush':
          pushUndoState();
          //write the character
          debugCanvas.current = {...debugCanvas.current,data:writeCharacter(index,e.key,debugCanvas.current)};
          updateCanvas();
          if(settingsRef.current.advanceWhenCharacterEntered && index < (canvDims.width*canvDims.height-1)){
            setActiveCharIndex(index+1);
          }
          break;
        case 'shape':
          //if you are drawing a line, redraw it with the new character
          if(line.moved){
            const startCoords = {x:line.startIndex%canvDims.width,y:Math.trunc(line.startIndex/canvDims.width)};
            const endCoords = {x:line.endIndex%canvDims.width,y:Math.trunc(line.endIndex/canvDims.width)};
            shapeData.current = {
              ...shapeData.current,
              begun : true,
              moved : true,
              startIndex : line.startIndex,
              endIndex : line.endIndex,
            };
            let temp;
            switch(shapeData.current.type){
              case 'line':
                temp = drawLine(settingsRef.current.brushSize,startCoords,endCoords,e.key,{...bufCanvas});
                break;
            }
            debugCanvas.current = {...debugCanvas.current,data:temp};
            updateCanvas();
          }
          break;
      }
      //if selbox, fill the area
      if(selection.started || selection.finished){
        let newData = cutAreaAndFill({x:selection.startCoord.x+selection.moveBy.x,y:selection.startCoord.y+selection.moveBy.y},{x:selection.endCoord.x+selection.moveBy.x,y:selection.endCoord.y+selection.moveBy.y},textData,canvDims.width,e.key);
        setCurrentChar(e.key);
        bufferCanvas.current = {...debugCanvas.current,data:newData};
        debugCanvas.current = {...debugCanvas.current,data:newData.data};
        updateCanvas();
        return;
      }
      
      setCurrentChar(e.key);
    }
    else if(e.key === 'Backspace'){
      pushUndoState();
      if(e.metaKey){
        debugCanvas.current = {...debugCanvas.current,data:clearCanvas(debugCanvas.current,selection)};
        updateCanvas();
        return;
      }
      //if selbox, clear the area
      else if(selection.finished){
        let newData = cutAreaAndFill({x:selection.startCoord.x+selection.moveBy.x,y:selection.startCoord.y+selection.moveBy.y},{x:selection.endCoord.x+selection.moveBy.x,y:selection.endCoord.y+selection.moveBy.y},textData,canvDims.width,' ');
        bufferCanvas.current = {...debugCanvas.current,data:newData.data};
        debugCanvas.current = {...debugCanvas.current,data:newData.data};
        updateCanvas();
        return;
      }

      //normal delete
      debugCanvas.current = {...debugCanvas.current,data:writeCharacter(settingsRef.current.advanceWhenCharacterEntered?Math.max(index-1,0):index,' ',{data:textData})};
      updateCanvas();
      if(settingsRef.current.advanceWhenCharacterEntered && index > 0){
        setActiveCharIndex(index-1);
      }
    }
    else if(e.key === 'ArrowRight'){
      //move returns false if it doesn't work
      if(move(selection,{x:1,y:0},bufCanvas.data,canvDims)){
        return;
      }
      else if(e.shiftKey)
        shiftCharacters(index,1,textData);
      else if((index%canvDims.width)<(canvDims.width-1)){
        setActiveCharIndex(index+1);
      }
    }
    else if(e.key === 'ArrowLeft'){
      //move returns false if it doesn't work
      if(move(selection,{x:-1,y:0},bufCanvas.data,canvDims)){
        return;
      }
      else if(e.shiftKey)
        shiftCharacters(index,-1,textData);
      else if((index%canvDims.width)>0)
        setActiveCharIndex(index-1);

    }
    else if(e.key === 'ArrowUp'){
      //move returns false if it doesn't work
      if(move(selection,{x:0,y:-1},bufCanvas.data,canvDims)){
        return;
      }
      else if(e.shiftKey)
        moveColumn(index,-1,textData);
      else if(index/canvDims.width>=1){
        setActiveCharIndex(index-canvDims.width);
      }
    }
    else if(e.key === 'ArrowDown'){
      //move returns false if it doesn't work
      if(move(selection,{x:0,y:1},bufCanvas.data,canvDims)){
        return;
      }
      else if(e.shiftKey)
        moveColumn(index,1,textData);
      else if(index/canvDims.width<(canvDims.height-1)){
        setActiveCharIndex(index+canvDims.width);
      }
    }
    else if(e.key == 'Enter'){
      if((canvDimSliders.width != canvDims.width) || (canvDimSliders.height != canvDims.height)){
        debugCanvas.current = {...debugCanvas.current,data:resizeCanvas(debugCanvas.current,{width:canvDimSliders.width,height:canvDimSliders.height}),width:canvDimSliders.width,height:canvDimSliders.height};
        if(imageRendererRef.current.imageLoaded)
          loadImageForRendering(imageRendererRef.current.imageSrc);
        else updateCanvas();
        const coords = {x:activeCharIndexRef.current % canvDims.width,y:Math.trunc(activeCharIndexRef.current/canvDims.height)};
        setActiveCharIndex(Math.min(coords.x,canvDimSliders.width) + Math.min(coords.y,canvDimSliders.height) * canvDimSliders.height);
      }
      else{
        if(e.shiftKey)
          newLine(index,1,textData);
        else
          setActiveCharIndex(index+canvDims.width - index%canvDims.width);
      }
    }
    else if(e.key == 'Tab'){
      if((index%canvDims.width)<(canvDims.width-8)){
        setActiveCharIndex(index+8);
      }
    }
  }

  //adds in \n characters at the end of each line
  function addLineBreaksToText(canvas){
    let finalString = '';
    for(let row = 0; row<canvas.height; row++){
      finalString += canvas.data.substring(row*canvas.width,(row+1)*canvas.width)+'\n';
    }
    return finalString;
  }

  function reverseAsciiPalette(){
    const reversed = imageRendererRef.current.asciiPalette.split('').toReversed().join('');
    setImageRenderer({...imageRendererRef.current,asciiPalette:reversed});
  }

  const loadImage = (files) => {
    if(files.length === 1)
      files = [files[0]];
    const file = files[0];
    //make sure there's a file here
    if(!(file === undefined)){
      //create a file reader object
      const reader = new FileReader();

      //attach a callback for when the FR is done opening the img
      reader.onload = (e) => {
        setImageRenderer({...imageRendererRef.current,
          imageLoaded:true,
          imageSrc:reader.result
        });
      };
      reader.readAsDataURL(file);
    }
  }

  function loadBackgroundImage(files){
    if(files.length === 1)
      files = [files[0]];
    const file = files[0];
    console.log(file);
    //make sure there's a file here
    if(!(file === undefined)){
      //create a file reader object
      const reader = new FileReader();
      //attach a callback for when the FR is done opening the img
      reader.onload = (e) => {
        if(file.type.startsWith('image')){
          const img = new Image();
          img.onload = function(){
            setBackgroundImage({...backgroundImageRef.current,
              imageSrc:reader.result,
              width:img.width,
              height:img.height,
              shown:true,
              type : 'image'
            });
          }
          img.src = reader.result;
        }
        else if(file.type.startsWith('video')){
          console.log(file);
          console.log(reader.result);
          setBackgroundImage({...backgroundImageRef.current,
            imageSrc:reader.result,
            shown:true,
            type : 'video'
          });
        }
      };
      reader.readAsDataURL(file);
    }
  }

  function getBrushCanvas(size){
    if(size === 0){
      let canv = createBackground({width:1,height:1});
      canv = canv.substring(0,4)+currentChar+canv.substring(5);
      return canv;
    }
    else{
      const dims = {width:size*2+1,height:size*2+1};
      let canv = {data:createBackground(dims),width:size*2+3,height:size*2+3};
      canv = fillCircle(size+1,size+1,size,currentChar,canv);
      return canv;
    }
  }

  function getClipboardCanvas(){
    const maxWidth = 32;
    const maxHeight = 16;
    let canv = {height:clipboard.height+2,width:clipboard.width+2,data:createBackground(clipboard)};
    canv.data = pasteText(clipboard.data,clipboard,{x:1,y:1},canv);

    if(canv.width > maxWidth){
      const startOffset = Math.ceil(maxWidth/2);
      const endOffset = Math.floor(maxWidth/2);
      let newStr = '';
      for(let y = 0; y<canv.height; y++){
        newStr += canv.data.substring(y*canv.width,(y)*canv.width+startOffset-1);
        newStr += '.';
        newStr += canv.data.substring((y+1)*canv.width - endOffset,(y+1)*canv.width);
      }
      canv.width = maxWidth;
      canv.data = newStr;
    }
    if(canv.height > maxHeight){
      const startOffset = Math.ceil(maxHeight/2);
      const endOffset = Math.floor(maxHeight/2);
      let newStr = canv.data.substring(0,(startOffset-1) * canv.width);
      newStr += '.'.padEnd(canv.width,'.');
      newStr += canv.data.substring(canv.data.length-(endOffset * canv.width));
      canv.height = maxHeight;
      canv.data = newStr;
    }
    return addLineBreaksToText(canv);
  }


  function pasteText(clipText,clipTextDims,coords,canvas){
    const dims = {...clipTextDims};
    //if the coords start off the page, crop the paste area so it just contains the part that fits
    if(coords.x < 0){
      const offset = Math.abs(coords.x);
      let newStr = '';
      for(let y = 0; y<dims.height; y++){
        newStr += clipText.substring(y*dims.width+offset,(y+1)*dims.width);
      }
      dims.width += coords.x;
      clipText = newStr;
      coords.x = 0;
    }
    if(coords.y < 0){
      let newStr = clipText.substring(-coords.y*dims.width);
      dims.height += coords.y;
      clipText = newStr;
      coords.y = 0;
    }
    let newData = '';
    //grab up until first row
    newData = canvas.data.substring(0,canvas.width*coords.y);
    for(let y = 0; y<dims.height; y++){
      const rowStart = canvas.width*(coords.y+y);
      const rowEnd = rowStart+canvas.width;
      const pasteStart = rowStart+coords.x;
      const pasteEnd = Math.min(pasteStart+dims.width,rowEnd);
      //get a row from the clipboard
      let pasteRow = clipText.substring(y*dims.width,(y+1)*dims.width,canvas.width+y*dims.width);
      
      //overlaying blank characters, like they're transparent
      if(settingsRef.current.blendTransparentAreas){
        let tempRow = '';
        for(let i = 0; i<pasteRow.length; i++){
          //if it's a blank character, grab the character from the underlying canvas
          if(pasteRow.charAt(i) === ' '){
            tempRow += canvas.data.charAt(pasteStart+i);
          }
          else{
            tempRow+=pasteRow.charAt(i);
          }
        }
        pasteRow = tempRow;
      }

      //grab part that'll fit on the canvas
      const pasteFinal = pasteRow.substring(0,Math.min(canvas.width-coords.x,dims.width+coords.x));
      newData += canvas.data.substring(rowStart,pasteStart)+pasteFinal+canvas.data.substring(pasteEnd,rowEnd);
    }
    newData += canvas.data.substring(canvas.width*(coords.y+dims.height));
    return newData;
  }

  //grabs any text, or images, in the users clipboard and puts them onto the canvas
  //https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/read
  async function pasteClipboardContents(coords){
    const contents = await navigator.clipboard.read(['text','images'])
    for(const item of contents){

      //if any item on the clipboard is an image, just use that!
      //^^ avoids pasting about text
      let mimeType = 'text/plain';
      for(let type of item.types){
        if(type === 'image/png')
          mimeType = type;
      }
      //if it's an image, overwrite the main canvas and render it
      if(mimeType === 'image/png'){
        const blob = await item.getType("image/png");
        const reader = new FileReader();
        reader.onload = (e) => {
          setImageRenderer({...imageRendererRef.current,
            imageLoaded:true,
            imageSrc:reader.result
          });
        }
        reader.readAsDataURL(blob);
      }
      //if it's text, paste it at the correct loc
      else if(mimeType === 'text/plain'){
        const blob = await item.getType('text/plain');
        let text = await blob.text();
        const clipDims = clipboardRef.current;
        const selBox = selectionBoxRef.current;
        const canvDims = debugCanvas.current;
        const canvasText = debugCanvas.current.data;
        const activeChar = activeCharIndexRef.current;
        let dimensions;
        //if the user has already stored data in the clipboard from sketchbook
        //AND if the content on the clipboard matches the content the user last copied from the app,
        //use the clipboard dimensions (this SHOULD cut off the add newline characters)
        if(clipDims !== undefined && clipboardRef.current === text){
          dimensions = clipDims;
        }
        //if not, paste it into the selectionbox
        else if(selBox.finished){
          dimensions = {width:Math.abs(selBox.startCoord.x - selBox.endCoord.x),height:Math.abs(selBox.startCoord.y - selBox.endCoord.y)}
        }
        else{
          //get the widest part of the clipboard text, to turn clipboard into a rectangle
          //break it into strings by newline
          const lines = text.split('\n');
          let width = 0;
          for(let line of lines){
            if(line.length > width){
              width = line.length;
            }
          }
          text = '';
          //pad each line to be 'width' characters long
          for(let line of lines){
            line = line.padEnd(width,' ');
            text += line;
          }
          //set the dims to the new clipboard bounding rectangle dims
          dimensions = {width:width,height:lines.length};
        }
        if(!coords)
          coords = {x:activeChar%canvDims.width,y:Math.trunc(activeChar/canvDims.width)};
        debugCanvas.current = {...debugCanvas.current,data:pasteText(text,dimensions,coords,debugCanvas.current)};
        updateCanvas();
      }
    }
  }

  function nullHandler(e){

  }

  function loadPreset(title){
    const newPreset = presets.find((element) => element.title == title);
    debugCanvas.current = {...debugCanvas.current,data:newPreset.data,height:newPreset.height,width:newPreset.width};
    updateCanvas();
    setCanvasDimensionSliders({height:newPreset.height,width:newPreset.width});
  }

  function getLineDirectionalChar(start,end){
    const slope = (end.y - start.y)/(end.x - start.x);
    const heading = Math.atan(slope)*180/Math.PI;
    if(-22.5 <= heading && heading < 22.5)
      return '-';
    else if(22.5 <= heading && heading < 67.5)
      return '\\';
    else if(67.5 <= heading && heading < 112.5)
      return '|'
    else if(112.5 <= heading && heading < 157.5)
      return '/';
    else if(157.5 <= heading && heading < 202.5)
      return '-';
    else if(-112.5 <= heading && heading < -67.5)
      return '|';
    else if(-67.5 <= heading && heading < 0)
      return '/';
    else return '*';
  }

  const Crosshairs = function(){
    const common = {
      lineHeight:settings.lineHeight,
      fontSize:settings.fontSize+'px',
      position:'absolute',
      background:'#ffdd009d',
      zIndex:'0'
    }
    const index = mouseCoords.x + mouseCoords.y * debugCanvas.current.width;
    const leftOffset = `calc(${index%debugCanvas.current.width}ch + ${settings.textSpacing*(index%debugCanvas.current.width)}px)`;
    const topOffset = `${Math.trunc(index/debugCanvas.current.width)*settings.lineHeight}em`;
    return(
      <>
      {/* horizontal */}
      <div style = {{...common,top:topOffset,left:'0ch',right:'0ch',height:'1em'}}></div>
      {/* vertical */}
      <div style = {{...common,top:'0em',left:leftOffset,width:'1ch',bottom:'0em'}}></div>
      </>
    )
  }

  function getBackgroundImageStyle(){
    const dimensions = {
      width:backgroundImage.width*backgroundImage.scale,
      height:backgroundImage.height*backgroundImage.scale
    }
    return({
      ...dimensions,
      fontSize:settings.fontSize+'px',
      lineHeight:settings.lineHeight,
      opacity:backgroundImage.opacity,
      imageRendering:'pixelated',
      marginLeft:`calc(0px - ${backgroundImage.leftCoord}ch - ${backgroundImage.leftCoord * settings.textSpacing}px)`,
      marginTop:`${backgroundImage.topCoord * settings.lineHeight}em`,
    })
  }
 
  const asciiDisplayStyle = {
    zIndex : 2,
    display:'block',
    width : 'fit-content',
    height : 'fit-content',
    transform:'scale(3,1)',
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize:'40px',
    backgroundColor:'#ffff00ff',
    color:'#0000ff'
  }

  const aboutTextStyle = {
    maxWidth : '605px',
    width:'fit-content',
    fontFamily: settings.font,
    fontSize:'14px',
    color:'#0000ffff',
    top:'0px',
    right:'20px',
    position:'fixed',
    overflowY:'scroll',
    height:'100vh',
    zIndex:'3',
  }

  const leftOffset = Math.min(selectionBox.startCoord.x,selectionBox.endCoord.x)+selectionBox.moveBy.x
  const boxWidth = Math.abs(selectionBox.startCoord.x - selectionBox.endCoord.x);
  const selectionBoxStyle = {
    width:`calc(${boxWidth}ch + ${boxWidth*settings.textSpacing}px)`,
    height:`${Math.abs(selectionBox.startCoord.y - selectionBox.endCoord.y)*settings.lineHeight}em`,
    left:`calc(${leftOffset}ch + ${leftOffset*settings.textSpacing}px)`,
    top:String((Math.min(selectionBox.startCoord.y,selectionBox.endCoord.y)+selectionBox.moveBy.y)*settings.lineHeight) + 'em',
    lineHeight:settings.lineHeight,
    fontSize:settings.fontSize+'px',
    borderColor:settings.textColor,
    zIndex:'0',
    position:'absolute',
    borderStyle:'dashed',
    borderWidth:'1px',
    fontFamily: settings.font,
    backgroundColor:'#ffff00'
  }

  const resizePreviewStyle = {
    width:String(canvasDimensionSliders.width)+'ch',
    height:String((canvasDimensionSliders.height)*settings.lineHeight)+'em',
    left:'0',
    top:'0',
    lineHeight:settings.lineHeight,
    letterSpacing:settings.textSpacing+'px',
    fontSize:settings.fontSize+'px',
    zIndex:0,
    position:'absolute',
    borderStyle:'dashed',
    borderWidth:'1px',
    pointerEvents:'none',
    fontFamily: settings.font,
  }

  function getHighlightBoxStyle(index){
    return {
      visibility:settings.textSelectable?'hidden':'visible',
      width:'1ch',
      height: settings.lineHeight+'em',
      left: `calc(${index%debugCanvas.current.width - 0.1}ch + ${settings.textSpacing*(index%debugCanvas.current.width)}px)`,
      top: `${Math.trunc(index/debugCanvas.current.width)*settings.lineHeight}em`,
      lineHeight:settings.lineHeight,
      fontSize:settings.fontSize+'px',
      position:'absolute',
      zIndex:'1'
    };
  }

  const canvasContainerStyle = {
    position:'sticky',
    lineHeight:settings.lineHeight,
    letterSpacing:settings.textSpacing+'px',
    whiteSpace: 'pre',
    fontFamily: settings.font,
    top:'50px'
  }

  const pageContainerStyle = {
    paddingTop:'20px',
    paddingLeft:'20px',
    paddingRight:'20px',
    paddingBottom:'20px',
    position:'fixed',
    top:'0px',
    left:'350px',
    right:'0px',
    bottom:'0px',
    overflow: 'auto',
  }

  const canvasStyle = {
    userSelect : settings.textSelectable?'text':'none',
    display:'block',
    position:'relative',
    cursor:settings.textSelectable?'text':(selectionBox.finished?'grab':'pointer'),
    fontSize:settings.fontSize+'px',
    color:settings.textColor,
    backgroundColor:'transparent',
    width:'fit-content',
    height:'fit-content',
    lineHeight:settings.lineHeight,
    letterSpacing:settings.textSpacing+'px',
  }

  const brushPreviewStyle = {
    width:'fit-content',
    whiteSpace:'pre',
    fontSize:'6px',
    color:settings.textColor,
    backgroundColor:settings.backgroundColor,
    lineHeight:settings.lineHeight,
    letterSpacing:settings.textSpacing+'px',
  }

  const backgroundStyle = {
    color:settings.textColor,
    backgroundColor:settings.backgroundColor,
    top:'-'+String(settings.lineHeight)+'em',
    fontSize:settings.fontSize+'px',
    width:`calc(${debugCanvas.current.width+2}ch + ${(debugCanvas.current.width+1)*settings.textSpacing}px)`,
  };

  const gridStyle = {
    pointerEvents:'none',
    position:'absolute',
    backgroundColor:settings.backgroundColor,
    fontSize:settings.fontSize+'px',
    lineHeight:settings.lineHeight,
    letterSpacing:settings.textSpacing+'px',
    height:`calc(${debugCanvas.current.height}*${settings.lineHeight}em)`,
    width:`calc(${debugCanvas.current.width}ch + ${(debugCanvas.current.width)*settings.textSpacing}px)`,
    zIndex:5,

    display: 'grid',
    background:`
      linear-gradient(#888888 1px, transparent 1px),
      linear-gradient(90deg, #888888 1px, transparent 1px)`,
    backgroundSize: `${100/debugCanvas.current.width}% ${100/debugCanvas.current.height}%`
  }


  return (
    <>
    <div style = {aboutTextStyle}>
      <div className = 'help_button' style = {{fontFamily:settings.font,textDecoration:'underline',cursor:'pointer',width:'fit-content',position:'fixed',top:'10px',right:'10px',backgroundColor:settings.showAbout?'blue':null,color:settings.showAbout?'white':null}} onClick = {(e) => {setSettings({...settingsRef.current,showAbout:!settingsRef.current.showAbout})}}>{settings.showAbout?'[Xx close xX]':'about'}</div>
      {settings.showAbout && <div className = "about_text">{aboutText}</div>}
    </div>
    {/* scrollable box, holding the canvas+background+border elements */}
    <div className = "page_container" id = "canvas-view-window" onScroll = {(e) => {e.stopPropagation();setMinimap();}} style = {pageContainerStyle}>
      <div className = "canvas_container" style = {canvasContainerStyle}>
      {backgroundImage.imageSrc && backgroundImage.shown && 
        <div style = {{position:'absolute',overflow:'clip',display:'block',fontSize:settings.fontSize+'px',lineHeight:settings.lineHeight,width:`calc(${debugCanvas.current.width}ch + ${(debugCanvas.current.width)*settings.textSpacing}px)`,height:`${(debugCanvas.current.height)*settings.lineHeight}em`}}>
          {backgroundImage.type == 'image' && 
              <img style = {getBackgroundImageStyle()} src = {backgroundImage.imageSrc}></img>
          }
          {backgroundImage.type == 'video' &&
            <video src = {backgroundImage.imageSrc} style = {getBackgroundImageStyle()} autoPlay muted = {true} loop = {true}></video>
          }
        </div>
      }
      {/* selection box */}
      {(selectionBox.started||selectionBox.finished) &&
        <div className = "selection_box" style = {selectionBoxStyle}/>
      }
      {settings.showGrid &&
        <div className = "canvas_overlay_grid" style = {gridStyle}>
        </div>
      }
      {/* canvas resizing preview box */}
      {(canvasDimensionSliders.width != debugCanvas.current.width || canvasDimensionSliders.height != debugCanvas.current.height) &&
        <div className = "resize_preview_box" style = {resizePreviewStyle}/>
      }
      {mouseCoords &&
      <>
        <div className = "highlight_box" style = {{...getHighlightBoxStyle(mouseCoords.x + mouseCoords.y * debugCanvas.current.width),border:'blue 1px dashed'}}/>
        {settings.showCrosshairs &&
          <Crosshairs></Crosshairs>
        }
      </>
      }
      <div className = "highlight_box" style = {{...getHighlightBoxStyle(activeCharIndex),animation: 'blinkBackground 1s infinite'}}/>
      <div id = "main-canvas" className = "ascii_canvas" onMouseEnter = {setMinimap} onMouseMove = {settings.textSelectable?nullHandler:handleMouseMove} onMouseDown = {settings.textSelectable?nullHandler:handleMouseDown} onMouseUp = {settings.textSelectable?nullHandler:handleMouseUp} onMouseLeave = {settings.textSelectable?nullHandler:handleMouseLeave} style = {canvasStyle}></div>
      <div className = "canvas_background" style = {backgroundStyle}>
        {addLineBreaksToText({data:createBackground({width:debugCanvas.current.width,height:debugCanvas.current.height}),width:debugCanvas.current.width+2,height:debugCanvas.current.height+2})}
      </div>
      </div>
    </div>
    <div className = "app_container" style ={{fontFamily:settings.font}}>
      {/* controls */}
      <div className = "ui_container" style = {{display:'block'}}>
        {ascii_title}
        <div style = {{transform:'rotate(90deg)',zIndex:'-1',pointerEvents:'none'}}>{ascii_wire}</div>
        <div className = 'ascii_display' style = {asciiDisplayStyle} >{currentChar === ' '?'{ }':currentChar}</div>
        {mouseCoords &&
          <div style = {{position:'absolute',right:'150px',top:'60px'}}>{`[${mouseCoords.x},${mouseCoords.y}]`}</div>
        }
        
        {/* tools */}
        <div className = "ui_header">*------- tools -------*</div>
        <br></br>
        <div style = {{display:'flex',gap:'10px'}}>
          <div className = 'ascii_button' style = {{backgroundColor:settings.drawingMode == 'type'?'blue':null,color:settings.drawingMode == 'type'?'white':null}} onClick = {()=>setSettings({...settingsRef.current,drawingMode:'type'})}>type</div>
          <div className = 'ascii_button' style = {{backgroundColor:settings.drawingMode == 'brush'?'blue':null,color:settings.drawingMode == 'brush'?'white':null}} onClick = {()=>setSettings({...settingsRef.current,drawingMode:'brush'})}>brush</div>
          <div className = 'ascii_button' style = {{backgroundColor:settings.drawingMode == 'shape'?'blue':null,color:settings.drawingMode == 'shape'?'white':null}} onClick = {()=>setSettings({...settingsRef.current,drawingMode:'shape'})}>shape</div>
          <div className = 'ascii_button' style = {{backgroundColor:settings.drawingMode == 'fill'?'blue':null,color:settings.drawingMode == 'fill'?'white':null}} onClick = {()=>setSettings({...settingsRef.current,drawingMode:'fill'})}>fill</div>
          {/* clear canvas */}
          <div className = "ascii_button" id = "clear-canvas-button" onClick = {(e) => {clearCanvas();}}>clear</div>
        </div>
        {/* tool settings */}
        <br></br>
        <div style = {{color:'#555454ff',fontStyle:'italic'}}>settings</div>
        <div id = "tool-settings" style = {{display:'flex',flexDirection:'column'}}>
          {settings.drawingMode == 'type' && 
            <AsciiButton onClick = {() => {setSettings({...settingsRef.current,advanceWhenCharacterEntered:!settingsRef.current.advanceWhenCharacterEntered})}} title = {'advance cursor when typing'} state = {settings.advanceWhenCharacterEntered}></AsciiButton>
          }
          {settings.drawingMode == 'shape' &&
          <>
            <div style = {{display:'flex',gap:'1ch'}}>
              <div onClick = {()=>{setSettings({...settingsRef.current,shapeType:'line'});shapeData.current = {...shapeData.current,type:'line'};}} style = {{cursor:'pointer',color:settings.shapeType == 'line'?'white':'blue',background:settings.shapeType == 'line'?'blue':'transparent'}}>line</div>
              <div onClick = {()=>{setSettings({...settingsRef.current,shapeType:'box'});shapeData.current = {...shapeData.current,type:'box'};}} style = {{cursor:'pointer',color:settings.shapeType == 'box'?'white':'blue',background:settings.shapeType == 'box'?'blue':'transparent'}}>box</div>
              {/* <div onClick = {()=>{setSettings({...settingsRef.current,shapeType:'circle'});shapeData.current = {...shapeData.current,type:'circle'};}} style = {{cursor:'pointer',color:settings.shapeType == 'circle'?'white':'blue',background:settings.shapeType == 'circle'?'blue':'transparent'}}>circle</div> */}
            </div>
            <br></br>
            {settings.shapeType == 'line' &&
            <>
              <Slider maxLength = {10} label = {'line thickness'} stepsize = {1} callback = {(val) => {setSettings({...settingsRef.current,brushSize:parseInt(val)});}} value = {settings.brushSize} defaultValue={settings.brushSize} min = {1} max = {10}></Slider>
              <AsciiButton state = {settings.fillLineByDirection} title = {'use directional \'-\\|/)\' char'} onClick = {() => {setSettings({...settingsRef.current,fillLineByDirection:!settingsRef.current.fillLineByDirection})}}></AsciiButton>
            </>
            }
            {settings.shapeType == 'box' &&
            <>
              <div style = {{marginLeft:'30px',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gridTemplateRows:'repeat(3,1fr)',width:'fit-content',height:'fit-content'}}>
                <input type = 'text' maxLength={1} className = "border_input" style = {{width:'1ch',border:'none',cursor:'pointer',padding:'2px'}} defaultValue = {settings.boxCharacters.topL} onInput = {(e) => {setSettings({...settingsRef.current,boxCharacters:{...settingsRef.current.boxCharacters,topL:e.target.value}})}}></input>
                <input type = 'text' maxLength={1} className = "border_input" style = {{width:'1ch',border:'none',cursor:'pointer',padding:'2px'}} defaultValue = {settings.boxCharacters.top} onInput = {(e) => {setSettings({...settingsRef.current,boxCharacters:{...settingsRef.current.boxCharacters,top:e.target.value}})}}></input>
                <input type = 'text' maxLength={1} className = "border_input" style = {{width:'1ch',border:'none',cursor:'pointer',padding:'2px'}} defaultValue = {settings.boxCharacters.topR} onInput = {(e) => {setSettings({...settingsRef.current,boxCharacters:{...settingsRef.current.boxCharacters,topR:e.target.value}})}}></input>
                <input type = 'text' maxLength={1} className = "border_input" style = {{width:'1ch',border:'none',cursor:'pointer',padding:'2px'}} defaultValue = {settings.boxCharacters.sideL} onInput = {(e) => {setSettings({...settingsRef.current,boxCharacters:{...settingsRef.current.boxCharacters,sideL:e.target.value}})}}></input>
                <input type = 'text' maxLength={1} className = "border_input" style = {{width:'1ch',border:'none',cursor:'pointer',padding:'2px'}} defaultValue = {settings.boxCharacters.fill} onInput = {(e) => {setSettings({...settingsRef.current,boxCharacters:{...settingsRef.current.boxCharacters,fill:e.target.value}})}}></input>
                <input type = 'text' maxLength={1} className = "border_input" style = {{width:'1ch',border:'none',cursor:'pointer',padding:'2px'}} defaultValue = {settings.boxCharacters.sideR} onInput = {(e) => {setSettings({...settingsRef.current,boxCharacters:{...settingsRef.current.boxCharacters,sideR:e.target.value}})}}></input>
                <input type = 'text' maxLength={1} className = "border_input" style = {{width:'1ch',border:'none',cursor:'pointer',padding:'2px'}} defaultValue = {settings.boxCharacters.bottomL} onInput = {(e) => {setSettings({...settingsRef.current,boxCharacters:{...settingsRef.current.boxCharacters,bottomL:e.target.value}})}}></input>
                <input type = 'text' maxLength={1} className = "border_input" style = {{width:'1ch',border:'none',cursor:'pointer',padding:'2px'}} defaultValue = {settings.boxCharacters.bottom} onInput = {(e) => {setSettings({...settingsRef.current,boxCharacters:{...settingsRef.current.boxCharacters,bottom:e.target.value}})}}></input>
                <input type = 'text' maxLength={1} className = "border_input" style = {{width:'1ch',border:'none',cursor:'pointer',padding:'2px'}} defaultValue = {settings.boxCharacters.bottomR} onInput = {(e) => {setSettings({...settingsRef.current,boxCharacters:{...settingsRef.current.boxCharacters,bottomR:e.target.value}})}}></input>
              </div>
            </>
            }
            <br></br>
          </>
          }
          {settings.drawingMode == 'fill' &&
          <>
          <div style = {{display:'flex',gap:'1ch'}}>
            <div style = {{cursor:'pointer',color:settings.drawFromClipboard?'blue':'white',background:settings.drawFromClipboard?'transparent':'blue'}} onClick = {()=>{setSettings({...settingsRef.current,drawFromClipboard:false})}}>character</div>
            <div style = {{cursor:'pointer',color:settings.drawFromClipboard?'white':'blue',background:settings.drawFromClipboard?'blue':'transparent'}} onClick = {()=>{setSettings({...settingsRef.current,drawFromClipboard:true})}}>clipboard</div>
          </div>
          {settings.drawFromClipboard &&
          <>
            {clipboard &&
            <>
            <div style = {{display:'flex',width:'150px',height:'fit-content',justifyContent:'center'}}>
              <div style = {{...brushPreviewStyle,width:'fit-content',height:'fit-content'}}>
                {getClipboardCanvas()}
              </div>
            </div>
            <div style = {{cursor:'pointer',color:'white',background:'red',width:'fit-content'}} onClick = {()=>{setClipboard(undefined)}}>clear clipboard</div>
            </>
            }
            <div style = {{color:'red'}}>copy canvas area to create a stamp!</div>
          </>
          }
          </>
          }
          {settings.drawingMode == 'brush' &&
          <>
            <div style = {{display:'flex',gap:'1ch'}}>
              <div style = {{cursor:'pointer',color:settings.drawFromClipboard?'blue':'white',background:settings.drawFromClipboard?'transparent':'blue'}} onClick = {()=>{setSettings({...settingsRef.current,drawFromClipboard:false})}}>character</div>
              <div style = {{cursor:'pointer',color:settings.drawFromClipboard?'white':'blue',background:settings.drawFromClipboard?'blue':'transparent'}} onClick = {()=>{setSettings({...settingsRef.current,drawFromClipboard:true})}}>clipboard</div>
            </div>
            {!settings.drawFromClipboard &&
            <>
            <Slider maxLength = {10} label = {'brush size'} stepsize = {1} callback = {(val) => {setSettings({...settingsRef.current,brushSize:parseInt(val)});}} value = {settings.brushSize} defaultValue={settings.brushSize} min = {1} max = {10}></Slider>
            <AsciiButton state = {settings.useDynamicBrush} title = {'dynamic'} onClick = {() => {setSettings({...settingsRef.current,useDynamicBrush:!settingsRef.current.useDynamicBrush})}}></AsciiButton>
            <div style = {{display:'flex',width:'150px',height:'fit-content',justifyContent:'center'}}> 
              <div style = {brushPreviewStyle}>
                {addLineBreaksToText({data:getBrushCanvas(settings.brushSize-1),width:(settings.brushSize-1)*2+3,height:(settings.brushSize-1)*2+3})}
              </div>
            </div>
            </>
            }
            {settings.drawFromClipboard &&
            <>
              {clipboard &&
              <>
                <div style = {{display:'flex',width:'150px',height:'fit-content',justifyContent:'center'}}>
                  <div style = {{...brushPreviewStyle,width:'fit-content',height:'fit-content'}}>
                    {getClipboardCanvas()}
                  </div>
                </div>
                <div style = {{cursor:'pointer',color:'white',background:'red',width:'fit-content'}} onClick = {()=>{setClipboard(undefined)}}>clear clipboard</div>
              </>
              }
              <div style = {{color:'red'}}>copy canvas area to create a stamp!</div>
            </>
            }
          </>
          }
        </div>
        {!(selectionBox.started || selectionBox.finished) && 
          <div className = 'help_text' style ={{color:'#ff0000'}}>(shift+drag to select an area)</div>
        }
        {(selectionBox.started && !selectionBox.finished) &&
          <div className = 'help_text' style ={{color:'#ff0000'}}>selecting [{selectionBox.startCoord.x},{selectionBox.startCoord.y}],[{selectionBox.endCoord.x},{selectionBox.endCoord.y}]...</div>
        }
        {selectionBox.finished &&
          <div className = 'help_text' style ={{color:'#ff0000'}}>(click + drag to translate area)</div>
        }
        {(selectionBox.started || selectionBox.finished) && 
        <>
        <div className = "ascii_button" style ={{color:'#ff0000'}} onClick = {(e) => {if(selectionBox.started || selectionBox.finished){
                                                            cutText(debugCanvas.current);
                                                            }}}>cut (cmd+x)</div>
        <div className = "ascii_button" style ={{color:'#ff0000'}} onClick = {(e) => {if(selectionBox.started || selectionBox.finished){
                                                            copyText(debugCanvas.current,{escaped:false,linebreaks:true});
                                                            }}}>copy (cmd+c)</div>
        </>}
        {/* paste button, when there's something to paste */}
        {(clipboard !== undefined) && 
          <div className = "ascii_button" style ={{color:'#ff0000'}} onClick = {(e) => {
                                                          pasteClipboardContents();
                                                          }}>paste (cmd+v)</div>
        }
        <br></br>
        {/* overlay white space */}
        <div style = {{color:'#555454ff',fontStyle:'italic'}}>spaces are...</div>
        <div style = {{display:'flex',gap:'1ch'}}>
          <div style = {{padding:'2px',cursor:'pointer',color:settings.blendTransparentAreas?'white':'blue',background:settings.blendTransparentAreas?'blue':'transparent'}} onClick = {() => {setSettings({...settingsRef.current,blendTransparentAreas:true})}}>transparent</div>
          <div style = {{padding:'2px',cursor:'pointer',color:settings.blendTransparentAreas?'blue':'white',background:settings.blendTransparentAreas?'transparent':'blue'}} onClick = {() => {setSettings({...settingsRef.current,blendTransparentAreas:false})}}>opaque</div>
        </div>
        
        {/* canvas */}
        <br></br>
        <div className = "ui_header">*------- text -------*</div>
        <br></br>
        <div className = "dropdown_container">
        <div style = {{color:'#555454ff',fontStyle:'italic'}}>font</div>
        <select className = "dropdown" style = {{userSelect :'none'}} value = {settings.font.title}
            onInput  = {(e) => {
              const font = fontOptions.find((element) => element.title === e.target.value);
              setSettings({...settingsRef.current,font:font.cssName});
            }}>
            <>{fontOptions.map((op,index) => (<option key = {index}>{op.title}</option>))}</>
        </select>
        </div>
        <br></br>
        <Slider maxLength = {20} label = {'font size'} stepsize = {0.1} callback = {(val) => {setSettings({...settingsRef.current,fontSize:val})}} defaultValue={settings.fontSize} min = {1} max = {20}></Slider>
        <Slider maxLength = {20} label = {'horizontal spacing'} stepsize = {0.1} callback = {(val) => {setSettings({...settingsRef.current,textSpacing:val})}} defaultValue={settings.textSpacing} min = {-0.5} max = {4}></Slider>
        <Slider maxLength = {20} label = {'vertical spacing'} stepsize = {0.01} callback = {(val) => {setSettings({...settingsRef.current,lineHeight:val})}} defaultValue={settings.lineHeight} min = {0.1} max = {2}></Slider>
        <br></br>
        <div className = "ui_header">*------ canvas ------*</div>
        <br></br>
        {/* canvas view window visualizer */}
        <div style = {{transition:'0.5s',opacity:mouseCoords?'100%':'0%',position:'fixed',right:'20px',top:'40px',zIndex:'-1',pointerEvents:'none'}}>
          <div style = {{position:'relative',backgroundColor:settings.backgroundColor,display:'block',outline:'dashed 1px blue',width:`${viewWindow.totalWidth}px`,height:`${viewWindow.totalHeight}px`}}>
            <div style = {{position:'absolute',backgroundColor:settings.textColor,width:`${viewWindow.viewWidth}px`,height:`${viewWindow.viewHeight}px`,top:`${viewWindow.startY}px`,left:`${viewWindow.startX}px`}}>
            </div>
          </div>
        </div>
        <div style = {{color:'#555454ff',fontStyle:'italic'}}>canvas dimensions</div>
        <div style = {{display:'flex'}}>
        <div style = {{marginLeft:'1ch'}} className = 'ui_header'>width:</div>
        <NumberInput name = "width" value = {canvasDimensionSliders.width} min = {1} max = {1024} buttonCallback = {(val) => {
          debugCanvas.current = {...debugCanvas.current,data:resizeCanvas(debugCanvas.current,{height:debugCanvas.current.height,width:val}),width:val};
          //trigger update/rerender image if needed
          if(imageRendererRef.current.imageLoaded)
            loadImageForRendering(imageRendererRef.current.imageSrc);
          else updateCanvas();
          setCanvasDimensionSliders({width:val,height:canvasDimensionSliders.height})}} inputCallback = {(val) =>{setCanvasDimensionSliders({width:val,height:canvasDimensionSlidersRef.current.height})}}></NumberInput>
        {debugCanvas.current.width != canvasDimensionSliders.width &&
          <div className = "ascii_button" onClick = {(e) => {setCanvasDimensionSliders({...canvasDimensionSlidersRef.current,width:debugCanvas.current.width})}}>[X]</div>
        }
        </div>
        <div style = {{display:'flex'}}>
        <div className = 'ui_header'>height:</div>
        <NumberInput name = "height" value = {canvasDimensionSliders.height} min = {1} max = {1024} buttonCallback = {(val) => {
          debugCanvas.current = {...debugCanvas.current,data:resizeCanvas(debugCanvas.current,{width:debugCanvas.current.width,height:val}),height:val};
          //trigger update/rerender image if needed
          if(imageRendererRef.current.imageLoaded)
            loadImageForRendering(imageRendererRef.current.imageSrc);
          else updateCanvas();
          setCanvasDimensionSliders({width:canvasDimensionSliders.width,height:val})}} inputCallback = {(val) =>{setCanvasDimensionSliders({height:val,width:canvasDimensionSlidersRef.current.width})}}></NumberInput>
        {debugCanvas.current.height != canvasDimensionSliders.height &&
          <div className = "ascii_button" onClick = {(e) => {setCanvasDimensionSliders({...canvasDimensionSlidersRef.current,height:debugCanvas.current.height})}}>[X]</div>
        }
        </div>
        { (canvasDimensionSliders.width != debugCanvas.current.width || canvasDimensionSliders.height != debugCanvas.current.height) &&
          <div className = "ascii_button" onClick = {() =>{
            debugCanvas.current = {...debugCanvas.current,data:resizeCanvas(debugCanvas.current,{width:canvasDimensionSlidersRef.current.width,height:canvasDimensionSlidersRef.current.height}),width:canvasDimensionSlidersRef.current.width,height:canvasDimensionSlidersRef.current.height};
            if(imageRendererRef.current.imageLoaded)
              loadImageForRendering(imageRendererRef.current.imageSrc);
            else updateCanvas();
          }} style = {{color:'#0000ff'}}>[enter] apply</div>
        }
        <br></br>

        <ColorPicker backgroundColor = {settings.backgroundColor} textColor = {settings.textColor} defaultValue = {{bg:settings.backgroundColor,fg:settings.textColor}} callback = {{bg:(val) => {setSettings({...settingsRef.current,backgroundColor:val})},fg:(val) => {setSettings({...settingsRef.current,textColor:val})}}}></ColorPicker>
        <br></br>
        <div style = {{display:'flex',gap:'1ch'}}>
          <DropZone title = {`choose background image`} callback = {loadBackgroundImage}></DropZone>
          {backgroundImage.imageSrc && 
            <div onClick = {() => {setBackgroundImage({...backgroundImageRef.current,shown:!backgroundImage.shown})}} style = {{cursor:'pointer',color:backgroundImage.shown?'blue':'white',backgroundColor:backgroundImage.shown?'transparent':'blue'}}>{backgroundImage.shown?'hide':'show'}</div>
          }
        </div>
        {backgroundImage.imageSrc && backgroundImage.shown &&
          <>
          {backgroundImage.type == 'image' &&
          <img src = {backgroundImage.imageSrc} style = {{imageRendering:'pixelated',width:'100%',maxWidth:'200px'}}></img>
          }
          {backgroundImage.type == 'video' &&
            <video src = {backgroundImage.imageSrc} autoPlay muted = {true} loop = {true} style = {{maxWidth:'200px'}}></video>
          }
          <br></br>
          <Slider maxLength = {20} label = {'scale'} callback = {(val) => {setBackgroundImage({...backgroundImageRef.current,scale:parseFloat(val)});}} value = {parseFloat(backgroundImage.scale)} defaultValue={1.0} min = {0.1} stepsize = {0.1} max = {10}></Slider>
          <div style = {{minWidth:'1ch',gap:'1ch',marginLeft:'30px',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gridTemplateRows:'repeat(3,1fr)',width:'fit-content',height:'fit-content'}}>
            <div>{` `}</div>
            <div style = {{cursor:'pointer',color:'white',backgroundColor:'blue'}} onClick = {()=>{setBackgroundImage({...backgroundImageRef.current,topCoord:backgroundImageRef.current.topCoord-1})}}>{`^`}</div>
            <div>{` `}</div>
            <div style = {{cursor:'pointer',color:'white',backgroundColor:'blue'}} onClick = {()=>{setBackgroundImage({...backgroundImageRef.current,leftCoord:backgroundImageRef.current.leftCoord+1})}}>{`<`}</div>
            <div>{` `}</div>
            <div style = {{cursor:'pointer',color:'white',backgroundColor:'blue'}} onClick = {()=>{setBackgroundImage({...backgroundImageRef.current,leftCoord:backgroundImageRef.current.leftCoord-1})}}>{`>`}</div>
            <div>{` `}</div>
            <div style = {{cursor:'pointer',color:'white',backgroundColor:'blue'}} onClick = {()=>{setBackgroundImage({...backgroundImageRef.current,topCoord:backgroundImageRef.current.topCoord+1})}}>{`v`}</div>
            <div>{` `}</div>
          </div>
          <Slider maxLength = {10} label = {'opacity'} stepsize = {1} callback = {(val) => {setBackgroundImage({...backgroundImage,opacity:parseFloat(val/10)});}} value = {parseInt(backgroundImage.opacity*10)} defaultValue={parseInt(backgroundImage.opacity*10)} min = {0} max = {10}></Slider>
          </>
        }
        <br></br>
        {/* drop zone */}
        <div className = "ui_header">*------- render image -------*</div>
        <br></br>
        <div style = {{display:'flex',width:'fit-content',alignItems:'center',flexDirection:'column'}}>
        {imageRenderer.imageLoaded &&
        <>
          <img className = "image_preview" style = {{imageRendering:'pixelated'}} src = {imageRenderer.imageSrc}/>
          <div className = "ascii_button" onClick = {(e) => {imageLayer.current.data = ''; updateCanvas(); setImageRenderer({...imageRendererRef.current,imageLoaded:false,imageSrc:null})}}>{'~Xx clear xX~'}</div>
          <div className = "ascii_button" id = "commit-image-button" onClick = {(e) => {
            debugCanvas.current = {width:debugCanvas.current.width,height:debugCanvas.current.height,data:overlayImageOnCanvas()};
            updateCanvas();
            imageLayer.current.data = '';
            setImageRenderer({...imageRendererRef.current,imageLoaded:false,imageSrc:null});}}>{'[commit to canvas]'}</div>
          <div style = {{color:'#555454ff',fontStyle:'italic'}}>resize to fit:</div>
          <div style = {{display:'flex',gap:'1ch'}}>
            <div style = {{cursor:'pointer',color:imageRenderer.fit == 'width' ? 'white':'blue',background:imageRenderer.fit == 'width' ? 'blue':'transparent'}} onClick = {()=>{setImageRenderer({...imageRendererRef.current,fit:'width'})}}>width</div>
            <div style = {{cursor:'pointer',color:imageRenderer.fit == 'height' ? 'white':'blue',background:imageRenderer.fit == 'height' ? 'blue':'transparent'}} onClick = {()=>{setImageRenderer({...imageRendererRef.current,fit:'height'})}}>height</div>
            <div style = {{cursor:'pointer',color:imageRenderer.fit == 'fill' ? 'white':'blue',background:imageRenderer.fit == 'fill' ? 'blue':'transparent'}} onClick = {()=>{setImageRenderer({...imageRendererRef.current,fit:'fill'})}}>fill</div>
          </div>
        </>
        }
        <DropZone title = {
`+---------------------+
|                     |
|  Drop images here,  |
| or click to upload. |
|                     |
+---------------------+`}
         callback = {loadImage}></DropZone>
        </div>
        {imageRenderer.imageLoaded &&
        <>
        <div style = {{display:'flex',gap:'10px'}}>
          <div className = 'ascii_button' style = {{backgroundColor:imageRenderer.technique == 'characters'?'blue':null,color:imageRenderer.technique == 'characters'?'white':null}} onClick = {()=>{setImageRenderer({...imageRendererRef.current,technique:'characters'});}}>characters</div>
          <div className = 'ascii_button' style = {{backgroundColor:imageRenderer.technique == 'words'?'blue':null,color:imageRenderer.technique == 'words'?'white':null}} onClick = {()=>{setImageRenderer({...imageRendererRef.current,technique:'words'});}}>words</div>
        </div>
        {imageRenderer.technique == 'words' &&
        <>
          <textarea wrap="off" style = {{
            whiteSpace: 'pre',
            height:(imageRenderer.wordList.length?((imageRenderer.wordList.length+1)*(1.15)):(1))+'em',
            backgroundColor:'blue',
            color:'white',
            resize:'none',
            border:'none'
          }} onChange = {(e) => setImageRenderer({...imageRendererRef.current,wordList:getWordListFromLineBreakString(e)})} value = {getWordListAsLineBreakString(imageRenderer.wordList)}></textarea>
          <div className = 'ascii_button' onClick = {(e) => {setImageRenderer({...imageRendererRef.current,wordList:imageRendererRef.current.wordList.toReversed()});}}>reverse</div>
          <div style = {{display:'flex',gap:'10px'}}>
            <div className = 'ascii_button' style = {{backgroundColor:imageRenderer.wordRenderStyle == 'break words'?'blue':null,color:imageRenderer.wordRenderStyle == 'break words'?'white':null}} onClick = {()=>{setImageRenderer({...imageRendererRef.current,wordRenderStyle:'break words'});}}>break words</div>
            <div className = 'ascii_button' style = {{backgroundColor:imageRenderer.wordRenderStyle == 'unbroken'?'blue':null,color:imageRenderer.wordRenderStyle == 'unbroken'?'white':null}} onClick = {()=>{setImageRenderer({...imageRendererRef.current,wordRenderStyle:'unbroken'});}}>unbroken</div>
          </div>
        </>
        }
        {imageRenderer.technique == 'characters' &&
        <>
        <AsciiPaletteInput value = {imageRenderer.asciiPalette} callback = {(val) => {setImageRenderer({...imageRendererRef.current,asciiPalette:val});}} ></AsciiPaletteInput>
        <div className = 'ascii_button' onClick = {reverseAsciiPalette}>reverse</div>
        <div style = {{display:'flex',gap:'10px'}}>
          <div>preset palettes:</div>
          <div className = 'ascii_button' style = {{backgroundColor:asciiPalettePreset == 'full'?'blue':null,color:asciiPalettePreset == 'full'?'white':null}} onClick = {()=>{setAsciiPalettePreset('full');setImageRenderer({...imageRendererRef.current,asciiPalette:asciiPalettePresets['full']});}}>full</div>
          <div className = 'ascii_button' style = {{backgroundColor:asciiPalettePreset == 'symbols'?'blue':null,color:asciiPalettePreset == 'symbols'?'white':null}} onClick = {()=>{setAsciiPalettePreset('symbols');setImageRenderer({...imageRendererRef.current,asciiPalette:asciiPalettePresets['symbols']});}}>symbols</div>
          <div className = 'ascii_button' style = {{backgroundColor:asciiPalettePreset == 'letters'?'blue':null,color:asciiPalettePreset == 'letters'?'white':null}} onClick = {()=>{setAsciiPalettePreset('letters');setImageRenderer({...imageRendererRef.current,asciiPalette:asciiPalettePresets['letters']});}}>letters</div>
        </div>
        </>
        }
        <Slider maxLength = {20} label = {'image brightness'} stepsize = {0.1} callback = {(val) => {setImageRenderer({...imageRendererRef.current,gamma:(4.0 - val)});}} defaultValue={imageRenderer.gamma} min = {0.0} max = {4.0}></Slider>
        <Slider maxLength = {20} label = {'image contrast'} stepsize = {0.1} callback = {(val) => {setImageRenderer({...imageRendererRef.current,contrast:val});}} defaultValue={imageRenderer.contrast} min = {0.0} max = {2.0}></Slider>
        </>
        }
        {/* download */}
        <br></br>
        <div className = "ui_header">*------- download -------*</div>
        <div style = {{color:'#555454ff',fontStyle:'italic'}}>as a...</div>
        <div style = {{display:'flex',flexDirection:'column',marginLeft:'10px'}}>
          <div className = "ascii_button" onClick = {(e) => {downloadCanvas(debugCanvas.current,{linebreaks:true,escaped:false,asConst:false})}}>plain .txt file</div>
          <div className = "ascii_button" onClick = {(e) => {downloadCanvas(debugCanvas.current,{linebreaks:true,escaped:true,asConst:false})}}>escaped .txt file w/line breaks</div>
          <div className = "ascii_button" onClick = {(e) => {downloadCanvas(debugCanvas.current,{linebreaks:false,escaped:true,asConst:true})}}>single-line javascript const</div>
        </div>
        <br></br>
        <div className = "ui_header">*------- misc. settings -------*</div>
        <br></br>
        <div className = 'ascii_button' onClick = {animateRedraw} >play back as animation</div>
        <AsciiButton  onClick = {() => {setSettings({...settingsRef.current,showCrosshairs:!settingsRef.current.showCrosshairs})}} title = {'crosshairs'} state = {settings.showCrosshairs}></AsciiButton>
        <AsciiButton  onClick = {() => {setSettings({...settingsRef.current,showGrid:!settingsRef.current.showGrid})}} title = {'grid'} state = {settings.showGrid}></AsciiButton>
        <AsciiButton  onClick = {() => {setSettings({...settingsRef.current,textSelectable:!settingsRef.current.textSelectable})}} title = {'freeze text'} state = {settings.textSelectable}></AsciiButton>
        <br></br>
        <div style = {{color:'#555454ff',fontStyle:'italic'}}>border design</div>
        <div style = {{display:'flex'}}>
          <div style = {{alignItems:'center',display:'flex',flexDirection:'column'}}>
            <input type = 'text' maxLength={1} className = "border_input" style = {{width:'1ch',border:'none',cursor:'pointer',padding:'5px'}} defaultValue = {settings.cornerCharacter} onInput = {(e) => {setSettings({...settingsRef.current,cornerCharacter:e.target.value})}}></input>
            <input type = 'text' maxLength={1} className = "border_input" style = {{width:'1ch',border:'none',cursor:'pointer',padding:'5px'}} defaultValue = {settings.sideCharacter} onInput = {(e) => {setSettings({...settingsRef.current,sideCharacter:e.target.value})}}></input>
          </div>
          <div style = {{alignItems:'center',display:'flex',flexDirection:'column'}}><input type = 'text' maxLength={1} className = "border_input" style = {{width:'1ch',border:'none',cursor:'pointer',padding:'5px'}} defaultValue = {settings.topCharacter} onInput = {(e) => {setSettings({...settingsRef.current,topCharacter:e.target.value})}}></input></div>
        </div>
        <br></br>
        <Dropdown label = 'previous drawings:' callback = {loadPreset} options = {presets.map((n) => n.title)}></Dropdown>
        <br></br>
      </div>
    </div>
  </>);
}

export default App