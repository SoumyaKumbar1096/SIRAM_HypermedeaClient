import {
    OPCUAClient,
    MessageSecurityMode, SecurityPolicy,
    AttributeIds,
    DataType
} from "node-opcua-client";

import { EnumNodeClass } from "node-opcua";

import express from 'express';

/**
 * Recursively browse nodes to collect those that are variables and return their ID.
 * 
 * @param {*} session OPC UA client session
 * @param {*} nodeId ID of the root OPC UA node
 * @returns a list of node IDs (all nodes being variables)
 */
async function findVariables(session, nodeId) {
    let variables = [];

    let node = await session.browse(nodeId);

    for (let childNode of node.references) {
        let childVariables = [];

        if(childNode.nodeClass == EnumNodeClass.Object)
            childVariables = await findVariables(session, childNode.nodeId);
        else if(childNode.nodeClass == EnumNodeClass.Variable)
            childVariables = [childNode.nodeId.toString()];

        childVariables.forEach(id => {
            if (!variables.includes(id)) variables.push(id);
        })
    }
    
    return variables;
}

/**
 * Read OPC UA variable to find out its data type and return an object to handle correspondence between OPC UA type and JS type.
 * 
 * @param {*} session OPC UA client session
 * @param {*} nodeId ID of some OPC UA variable
 * @returns a type definition, including its name as string and a type coercion function
 */
async function getVariableType(session, nodeId) {
    let dt = await session.getBuiltInDataType(nodeId);

    let name = 'String';
    
    switch (dt) {
        case DataType.Boolean: name = 'Boolean'; break;
        case DataType.Byte: name = 'Byte'; break;
        case DataType.Double: name = 'Double'; break;
        case DataType.Float: name = 'Float'; break;
        case DataType.Int16: name = 'Int16'; break;
        case DataType.Int32: name = 'Int32'; break;
        case DataType.LocalizedText: name = 'LocalizedText'; break;
        case DataType.SByte: name = 'SByte'; break;
        case DataType.String: name = 'String'; break;
        case DataType.UInt16: name = 'Int16'; break;
        case DataType.UInt32: name = 'UInt32'; break;
        case DataType.UInt32: name = 'UInt64'; break;
    }

    let coerce = val => val;

    switch (dt) {
        case DataType.Boolean:
            coerce = val => Boolean(val); break;
            
        case DataType.Byte:
        case DataType.Double:
        case DataType.Float:
        case DataType.Int16:
        case DataType.Int32:
        case DataType.SByte:
        case DataType.UInt16:
        case DataType.UInt32:
        case DataType.UInt32:
            coerce = val => Number(val); break;

        case DataType.LocalizedText:
        case DataType.String:
            coerce = val => String(val); break;
    }

    return {
        name: name,
        coerce: coerce
    };
}

/**
 * 1. create OPC UA client and browse all nodes to find variables
 * 2. set up Web server to handle GET/PUT requests for each variable
 */
async function main() {
    const options = {
        applicationName: "MyClient",
        connectionStrategy: {
            initialDelay: 1000,
            maxRetry: 1
        },
        securityMode: MessageSecurityMode.None,
        securityPolicy: SecurityPolicy.None,
        endpointMustExist: false,
    };
    
    const client = OPCUAClient.create(options);
    
    const endpointUrl = process.argv[2] || "opc.tcp://opcuademo.sterfive.com:26543";
    //const endpointUrl = "opc.tcp://10.1.9.1:49320"; //kepserver

    await client.connect(endpointUrl);
    const session = await client.createSession();

    console.log(`connected to OPC UA server at ${endpointUrl}`);

    let variables = await findVariables(session, "RootFolder");

    console.log(`found ${variables.length} OPC UA variables`);

    let variableTypes = {};

    for (let id of variables) {
        variableTypes[id] = await getVariableType(session, id);
    }

    console.log(`built type index for all variables`);

    const app = express();
    const port = 3001;

    app.use('/static', express.static('files'));
    app.use(express.json({ strict: false }));

    app.get('/', (req, res) => {
        console.log('>> GET /');

        res.json(variables);

        console.log(`<< [${variables[0]}, ${variables[1]}, ...]`);
    });
    
    app.get('/:nodeId', async (req, res) => {
        let id = req.params.nodeId;

        console.log(`>> GET /${id}`);

        if (!variableTypes[id]) {
            res.sendStatus(404);

            console.log('<< Not Found');
        } else {
            try {
                let val = await session.readVariableValue(id);

                let raw = val.value.value;
                res.json(raw);
    
                console.log(`<< OK [${val.value.value}]`);
            } catch (e) {
                res.status(500).send(e);

                console.log(`<< Internal Server Error [${e}]`);
            }
        }
    });

    app.put('/:nodeId', async (req, res) => {
        let id = req.params.nodeId;
        let raw = req.body;

        console.log(`>> PUT /${id} [${raw}]`);

        if (!variableTypes[id]) {
            res.sendStatus(404);

            console.log('<< Not Found');
        } else {
            let type = variableTypes[id];

            let status = await session.write({
                nodeId: id,
                attributeId: AttributeIds.Value,
                value: {
                    value: {
                        dataType: type.name,
                        value: type.coerce(raw), 
                    }
                }
            });

            if (status.value == 0) {
                res.sendStatus(204);
    
                console.log('<< No Content');
            } else {
                res.status(400).send(status.description);
    
                console.log(`<< Bad Request [${status.description}]`);
            }
        }
    });
    
    app.listen(port, e => {
        if (e) console.error(`couldn't start Web server: ${e}`);
        else console.log(`waiting for HTTP requests on port ${port}...`);
    });
    
    process.on('exit', async () => {
        // FIXME process exits before promises return...
        await session.close();
        await client.disconnect();
    });
}

main();
