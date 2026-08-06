export function debounce(fn, delay=250){
 let timer;
 return (...args)=>{
  clearTimeout(timer);
  timer=setTimeout(()=>fn(...args), delay);
 };
}

export function throttle(fn, limit=100){
 let lock=false;
 return (...args)=>{
  if(!lock){
   fn(...args);
   lock=true;
   setTimeout(()=>lock=false,limit);
  }
 };
}
