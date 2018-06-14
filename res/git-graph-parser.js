function tokenize(input){
    return input.split("\n").map(n=>n.trim()).filter(n=>n!="").map(line => {
        const tokens = line.split("->").map(n=>n.trim());
        const head = tokens.shift();
        const lasts = tokens.pop().split(/\s*,\s*/);
        return {head,lasts,body:tokens};
    })
}

function getBranchType(fromName,toName){
    if (toName == "dev" || toName == "master"){
        return toName;
    } if (toName.startsWith("release/")){
        return "release";
    } if (fromName == "master" || fromName.startsWith("release/")){
        return "fix";
    } else {
        return "feature";
    }
}

function anayalisePart(frm,b,current,assigned,isLast){
    if(isLast && b == "!close"){
        let list = current.fix.includes(frm)? current.fix: current.feature;
        let index = list.indexOf(frm);
        list[index] = null;
    }
    let branchType = getBranchType(frm,b);
    if (!(branchType in current)){
        assigned.has[branchType] = true;
        return isLast?frm:b;
    }
    if (b.startsWith("!")){
        return frm
    }
    if (current[branchType].includes(b)) {
        return isLast?frm:b
    }

    let index = current[branchType].indexOf(null);
    if (index == -1){
        current[branchType].push(b)
        assigned[branchType].push([b])
    } else {
        current[branchType][index] = b;
        assigned[branchType][index].push(b);
    }

    return isLast?frm:b;
}

function anayalise(tokens){
    const current = {feature:[],fix:[]}
    const assigned = {feature:[],fix:[],has:{},offset:{}}

    for(let {head, lasts, body} of tokens){
        let frm = body.reduce((frm,b)=>anayalisePart(frm,b,current,assigned,false),head);
        lasts.reduce((frm,b)=>anayalisePart(frm,b,current,assigned,true),frm);
    }

    assigned.offset.feature = 0;
    let offset = assigned.feature.length;

    if(assigned.has.dev){
        assigned.offset.dev = offset
        offset++;
    }
    assigned.offset.fix = offset;
    offset += assigned.fix.length;

    if(assigned.has.release){
        assigned.offset.release = offset
        offset++;
    }
    if(assigned.has.master){
        assigned.offset.master = offset;
    }
    return assigned;
}

function makeGraph(canvas,tokens,assi){
    const graph = startGraph(canvas,assi.offset.dev,assi.offset.master);

    const branches = {}
    if(assi.offset.dev !== undefined){
        let color = getColour(CONFIG.colors.dev,0);
        branches.dev = graph
            .orphanBranch({name:"dev",column:assi.offset.dev,color,commitDefaultOptions:{...CONFIG.commit,color}})
            .commit({dotSize:5,dotStrokeWidth:0})
    }
    if(assi.offset.master !== undefined){
        graph.commitOffsetX = 0;
        let color = getColour(CONFIG.colors.master,0);
        branches.master = graph
            .orphanBranch({name:"master",column:assi.offset.master,color,commitDefaultOptions:{...CONFIG.commit,color}})
            .commit({dotSize:5,dotStrokeWidth:0})
    }

    for(let {head, lasts, body} of tokens){
        let frm = body.reduce((frm,to)=>branchTo(frm,to,branches,assi),branches[head]);
        lasts.forEach((to)=>branchTo(frm,to,branches,assi));
    }

    if(branches.dev){
        branches.dev.commit({dotSize:5,dotStrokeWidth:0});
    }
    if(branches.master){
        branches.master.commit({dotSize:5,dotStrokeWidth:0});
    }
}

function getColour(colours,i){
    if(Array.isArray(colours)){
        return colours[i%colours.length]
    }
    return colours
}

function startGraph(canvas){
    const graph = new GitGraph({...CONFIG.setup,canvas});
    graph.template.branch.showLabel = true;
    graph.template.branch.labelRotation = 0;


    return graph
}

function branchTo(frm,name,branches,assi){
    if (name == "!close"){
        if(name != "dev" && name != "master"){
            delete branches[frm.name];
            frm.delete();
        }
        return;
    }
    if (name.startsWith("!c")){
        let limit = name.substr(2)*1;
        for(var i=0;i<limit;i++){
            frm.commit();
        }
        return frm;
    }
    if (name.startsWith("!t")){
        frm.tag(name.substr(2))
        return frm;
    }

    let branch = branches[name];
    if (branch === undefined){
        if(frm.name == "dev" || frm.name == "master"){
            if (frm.commits.length == 1){
                frm.commit({dotSize:5,dotStrokeWidth:0});
            }
        }
        let branchType = getBranchType(frm.name,name);
        let column = assi.offset[branchType];
        if(branchType in assi){
            column += assi[branchType].findIndex(l=>l.includes(name))
        }
        let color = getColour(CONFIG.colors[branchType],column)
        let newBranch = frm.branch({
            name, column, color,
            commitDefaultOptions:{...CONFIG.commit,color}
        })
        newBranch.commit();
        branches[name] = newBranch
        return newBranch;
    } else {
        frm.merge(branch);
        return branch
    }
}

const CONFIG = {
    "setup":{
        "template": {
            "colors": ["#979797", "#008fb5", "#f1c109"],
            "branch": {
                "lineWidth": 10,
                "spacingX": 50,
                "spacingY": 0,
                "labelRotation": 0
            },
            "commit": {
                "shouldDisplayTooltipsInCompactMode":false,
                "spacingY": -80,
                "dot": {
                    "size": 14
                },
                "message": {
                    "font": "normal 14pt Arial"
                },
                "displayTagBox": false
            }
        },
        "orientation": "horizontal",
        "mode": "compact"
    },
    "commit":{
        "displayTagBox":false
    },
    "colors":{
        "dev":"#4CAF50",
        "master":"#F44336",
        "release":"#FFC107",
        "feature":["#42A5F5","#1E88E5"],
        "fix":["#FFA726","#FB8C00"]
    }
};

for(let c of document.querySelectorAll(".gitgraph")){
    let tokens = tokenize(c.textContent);
    let assi = anayalise(tokens);

    makeGraph(c,tokens,assi);
}