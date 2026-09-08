import {trainModel} from './ml.js';
self.onmessage=({data})=>{try{self.postMessage({result:trainModel(data.dataset,data.opts,progress=>self.postMessage({progress}))})}catch(e){self.postMessage({error:e.message})}};
