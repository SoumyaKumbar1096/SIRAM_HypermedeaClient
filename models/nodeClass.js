//import mongoose from 'mongoose'
import { accessRestrictionsFlagToString, AddressSpace, WriteMask } from "node-opcua"
import { NodeClass } from "node-opcua"


// const nodeSchema = new mongoose.Schema({
//      nodeId: {
//         type: String,
//         trim: true,
//         required: true,
//         maxlength: 32,
//         unique: true
//     },
//     attributeId: {
//         type: Number,
//         trim: true,
//         required: true,
//         maxlength: 32
//     },
//     indexRange: {
//         type: Number,
//         trim: true,
//         maxlength: 32
//     },
//     value:{

//     }

// })

export class nClass{
    constructor(nodeId, value){
        this.nodeId = nodeId
        this.value = value
    }
}
// const obj1 = new NodeClass() 

//const obj = new NodeClass()