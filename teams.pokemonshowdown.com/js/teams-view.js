"use strict";function _inheritsLoose(subClass,superClass){subClass.prototype=Object.create(superClass.prototype);subClass.prototype.constructor=subClass;_setPrototypeOf(subClass,superClass);}function _setPrototypeOf(o,p){_setPrototypeOf=Object.setPrototypeOf?Object.setPrototypeOf.bind():function _setPrototypeOf(o,p){o.__proto__=p;return o;};return _setPrototypeOf(o,p);}












var MODES={
'1col':{width:100,colGap:''},
'2col':{width:50,colGap:'2rem'},
'3col':{width:33,colGap:'2rem'}
};











function exportSet(set){
var out="";


if(set.name&&set.name!==set.species){
out+=set.name+" ("+set.species+")";
}else{
out+=set.species;
}
if(set.gender==='M')out+=" (M)";
if(set.gender==='F')out+=" (F)";
if(set.item)out+=" @ "+set.item;
out+="  \n";

if(set.ability){
out+="Ability: "+set.ability+"  \n";
}


if(set.level&&set.level!==100){
out+="Level: "+set.level+"  \n";
}
if(set.shiny){
out+="Shiny: Yes  \n";
}
if(typeof set.happiness==='number'&&set.happiness!==255&&!isNaN(set.happiness)){
out+="Happiness: "+set.happiness+"  \n";
}
if(set.pokeball){
out+="Pokeball: "+set.pokeball+"  \n";
}
if(set.hpType){
out+="Hidden Power: "+set.hpType+"  \n";
}
if(typeof set.dynamaxLevel==='number'&&set.dynamaxLevel!==10&&!isNaN(set.dynamaxLevel)){
out+="Dynamax Level: "+set.dynamaxLevel+"  \n";
}
if(set.gigantamax){
out+="Gigantamax: Yes  \n";
}
if(set.teraType){
out+="Tera Type: "+set.teraType+"  \n";
}


var first=true;
if(set.evs){for(var _i2=0,_Dex$statNames2=
Dex.statNames;_i2<_Dex$statNames2.length;_i2++){var stat=_Dex$statNames2[_i2];
if(!set.evs[stat])continue;
if(first){
out+="EVs: ";
first=false;
}else{
out+=" / ";
}
out+=set.evs[stat]+" "+BattleStatNames[stat];
}
}
if(!first){
out+="  \n";
}
if(set.nature){
out+=set.nature+" Nature  \n";
}
first=true;
if(set.ivs){for(var _i4=0,_Dex$statNames4=
Dex.statNames;_i4<_Dex$statNames4.length;_i4++){var _stat=_Dex$statNames4[_i4];
if(set.ivs[_stat]===undefined||isNaN(set.ivs[_stat])||set.ivs[_stat]===31)continue;
if(first){
out+="IVs: ";
first=false;
}else{
out+=" / ";
}
out+=set.ivs[_stat]+" "+BattleStatNames[_stat];
}
}
if(!first){
out+="  \n";
}for(var _i6=0,_set$moves2=


set.moves;_i6<_set$moves2.length;_i6++){var move=_set$moves2[_i6];
if(move.startsWith("Hidden Power ")&&move.charAt(13)!=='['){
move="Hidden Power ["+move.slice(13)+"]";
}
out+="- "+move+"  \n";
}

return out;
}

function isOMNickname(nickname){
if(!nickname)return;

if(Dex.species.get(nickname).exists){

if(toID(nickname)==='cathy')return'cathy';
return Dex.species.get(nickname).name;
}else if(Dex.items.get(nickname).exists){
return Dex.items.get(nickname).name;
}else if(Dex.abilities.get(nickname).exists){
return Dex.abilities.get(nickname).name;
}else if(Dex.types.get(nickname).exists){
return Dex.types.get(nickname).name;
}
}

function PokemonSet(_ref){var set=_ref.set;
var omName=isOMNickname(set.name);
return preact.h("article",{"class":"psset"},
omName&&omName!==set.species?preact.h(preact.Fragment,null,omName," (",set.species,")"):preact.h(preact.Fragment,null,set.species),
set.gender?preact.h(preact.Fragment,null," (",set.gender,")"):preact.h(preact.Fragment,null),
set.item?preact.h(preact.Fragment,null," @ ",set.item," "):preact.h(preact.Fragment,null),
preact.h("br",null),
set.ability?preact.h(preact.Fragment,null,"Ability: ",set.ability,preact.h("br",null)):preact.h(preact.Fragment,null),
set.level&&set.level!==100?preact.h(preact.Fragment,null,"Level: ",set.level,preact.h("br",null)):preact.h(preact.Fragment,null),
set.shiny?preact.h(preact.Fragment,null,"Shiny: Yes",preact.h("br",null)):preact.h(preact.Fragment,null),
set.teraType?preact.h(preact.Fragment,null,"Tera Type: ",set.teraType,preact.h("br",null)):preact.h(preact.Fragment,null),

set.evs?preact.h(preact.Fragment,null,Dex.statNames.filter(function(stat){return set.evs[stat];}).map(function(stat,index,arr){return(
preact.h(preact.Fragment,null,
index===0?'EVs: ':'',
set.evs[stat]," ",BattleStatNames[stat],
index!==arr.length-1?' / ':''
));}
),preact.h("br",null)):preact.h(preact.Fragment,null),

set.nature?preact.h(preact.Fragment,null,set.nature.charAt(0).toUpperCase()+set.nature.slice(1)," Nature",preact.h("br",null)):preact.h(preact.Fragment,null),

set.ivs?preact.h(preact.Fragment,null,Dex.statNames.
filter(function(stat){return!(set.ivs[stat]===undefined||isNaN(set.ivs[stat])||set.ivs[stat]===31);}).
map(function(stat,index,arr){return(
preact.h(preact.Fragment,null,
index===0?'IVs: ':'',
set.ivs[stat]," ",BattleStatNames[stat],
index!==arr.length-1?' / ':''
));}
),preact.h("br",null)):preact.h(preact.Fragment,null),

set.moves?set.moves.map(function(move){
if(move.substr(0,13)==='Hidden Power '){
var hpType=move.slice(13);
move=move.slice(0,13);
move=move+"["+hpType+"]";
}

return preact.h(preact.Fragment,null,"- ",move," ",preact.h(PSIcon,{type:Dex.moves.get(move).type,hideAlt:true}),preact.h("br",null));
}):preact.h(preact.Fragment,null),

typeof set.happiness==='number'&&set.happiness!==255&&!isNaN(set.happiness)?
preact.h(preact.Fragment,null,"Happiness: ",set.happiness,preact.h("br",null)):
preact.h(preact.Fragment,null),
typeof set.dynamaxLevel==='number'&&set.dynamaxLevel!==10&&!isNaN(set.dynamaxLevel)?
preact.h(preact.Fragment,null,"Dynamax Level: ",set.dynamaxLevel,preact.h("br",null)):
preact.h(preact.Fragment,null),
set.gigantamax?preact.h(preact.Fragment,null,"Gigantamax: Yes",preact.h("br",null)):preact.h(preact.Fragment,null)
);
}var

SetBlock=function(_preact$Component){_inheritsLoose(SetBlock,_preact$Component);function SetBlock(){return _preact$Component.apply(this,arguments)||this;}var _proto=SetBlock.prototype;_proto.


render=function render(){
var set=this.props.set;
var gen=this.props.gen||(Dex.prefs('noanim')?5:6);
var spriteData=Dex.getSpriteData(
Dex.species.get(set.species),
true,
{gen:gen,shiny:set.shiny,gender:set.gender}
);
var forceResize=110;
if(matchMedia("(max-width: 450px)").matches&&this.props.mode==='2col'){
forceResize=55;
}
if(spriteData.w>forceResize){
var w=spriteData.w;
spriteData.w*=forceResize/w;
spriteData.h*=forceResize/w;
}
return preact.h("div",null,
preact.h("div",{style:{flex:'0 0 20%',width:'auto',pad:'3px'}},
preact.h("img",{
src:spriteData.url,
width:spriteData.w,
height:spriteData.h}
),
set.item?preact.h(PSIcon,{item:set.item}):preact.h(preact.Fragment,null)
),
preact.h("div",{style:{flex:"0 0 80%",textAlign:'left'}},
preact.h(PokemonSet,{set:set})
)
);
};return SetBlock;}(preact.Component);var


TeamViewer=function(_preact$Component2){_inheritsLoose(TeamViewer,_preact$Component2);















function TeamViewer(props){var _this;
_this=_preact$Component2.call(this,props)||this;_this.id=void 0;_this.pw=void 0;_this.state={team:undefined,error:undefined,copyButtonMsg:false,displayMode:localStorage.getItem('teamdisplaymode')||null,spriteGen:Number(localStorage.getItem('spritegen'))||6,manageOpen:false,changesMade:false,teamEdits:null,editError:null,copied:null,copyError:null};
_this.id=props.args.id;

_this.checkTeamID();
if(_this.state.displayMode==='default'){
_this.state.displayMode='1col';
localStorage.setItem('teamdisplaymode',_this.state.displayMode);
}return _this;
}var _proto2=TeamViewer.prototype;_proto2.
render=function render(){var _this$state$displayMo,_document$querySelect,_this2=this,_this$state$teamEdits;
if(this.state.error){
return preact.h("div",{"class":"message-error"},this.state.error);
}
if(!this.state.team){
return preact.h("div",{"class":"section",style:{textAlign:'center'}},
typeof this.state.team==='undefined'?
'Loading...':
preact.h(preact.Fragment,null,
preact.h("h2",{"class":"message-error"},"Team not found."),preact.h("br",null),
preact.h("em",null,"Either it doesn't exist or it's password protected. Check the link?")
)
);
}
var _this$state$team=this.state.team,team=_this$state$team.team,title=_this$state$team.title,ownerid=_this$state$team.ownerid,format=_this$state$team.format,views=_this$state$team.views;
var teamData=unpackTeam(team);
var modeName=(((_this$state$displayMo=this.state.displayMode)==null?void 0:_this$state$displayMo.charAt(0))||'1')+'-column';
var mode=MODES[this.state.displayMode||'1col'];

var isDark=((_document$querySelect=document.querySelector('html'))==null?void 0:_document$querySelect.classList[0])==='dark';
var link=this.id+(this.state.team["private"]?"-"+this.state.team["private"]:'');
var loggedin=toID(getShowdownUsername());
var manageClass=this.state.manageOpen?"button notifying":"button";

return preact.h("div",{"class":"section",style:{wordWrap:'break-word'}},
preact.h("div",{name:"header",className:"noselect"},
preact.h("small",null,preact.h("a",{href:'//'+Config.routes.teams},preact.h("i",{"class":"fa fa-arrow-left"}))),
preact.h("h1",null,title),"Owner: ",
preact.h("strong",{style:{color:BattleLog.usernameColor(ownerid)}},ownerid),preact.h("br",null),"Format: ",
format,preact.h("br",null),"Views: ",
views,preact.h("br",null),
preact.h("label",null,"Shortlink: "),preact.h("a",{href:"https://psim.us/t/"+link},"https://psim.us/t/",link),preact.h("br",null),
preact.h("hr",null),
preact.h("div",{name:"manage",style:{display:'flex',gap:'5px'}},
loggedin===this.state.team.ownerid?
preact.h("button",{"class":manageClass,onClick:function(){return _this2.changeManage();}},"Manage"):
loggedin&&preact.h("button",{"class":"button",onClick:function(){return _this2.copyToBuilder();}},"Copy to builder"),
preact.h("button",{
"class":"button",
disabled:!this.state.team||this.state.copyButtonMsg,
onClick:function(){return _this2.copyTeam();}},
this.state.copyButtonMsg?'Copied!':'Copy team'),
preact.h("button",{"class":"button",onClick:function(){return _this2.changeDisplayMode();}},"Display: ",modeName),
preact.h("button",{"class":"button",onClick:function(){return _this2.changeColorMode();}},"Use ",isDark?'light':'dark'," mode"),
preact.h("select",{
onChange:function(ev){return _this2.changeSpriteGen(ev);},
value:this.state.spriteGen,
"class":"button"},

[1,2,3,4,5,6].map(function(num){return preact.h("option",{value:num},"Gen ",num," Sprites");})
)
),
preact.h("hr",null),
this.state.editError&&preact.h(preact.Fragment,null,
preact.h("div",{"class":"message-error"},this.state.editError),
preact.h("hr",null)
),
this.state.copied&&preact.h(preact.Fragment,null,
preact.h("br",null),"Copied to your teambuilder! ",preact.h("a",{href:"/view/"+this.state.copied},"View"),preact.h("hr",null)
),
this.state.copyError&&preact.h(preact.Fragment,null,
preact.h("br",null),preact.h("div",{className:"message-error"},"Error copying team: ",this.state.copyError),preact.h("hr",null)
),
this.state.manageOpen&&preact.h(preact.Fragment,null,
preact.h("label",null,"Team visibility: "),
preact.h("select",{
"class":"button",
value:(_this$state$teamEdits=this.state.teamEdits)!=null&&_this$state$teamEdits["private"]||this.state.team["private"]?1:0,
onChange:function(ev){return _this2.editTeamValue('private',ev);}},

[1,0].map(function(n){return preact.h("option",{value:n},n?'private':'public');})
),preact.h("br",null),
preact.h("label",null,"Team format: "),preact.h("input",{onInput:function(ev){return _this2.editTeamValue('format',ev);}}),
this.state.changesMade&&preact.h(preact.Fragment,null,
preact.h("br",null),preact.h("button",{"class":"button notifying",onClick:function(){return _this2.commitEdit();}},"Save changes")
),
preact.h("br",null),
preact.h("button",{"class":"button",onClick:function(){return _this2.runDelete();}},"Delete team"),
preact.h("hr",null)
)
),
preact.h("div",{
name:"sets",
style:{
display:'flex',
alignItems:'stretch',
flexWrap:'wrap',
rowGap:'1rem',
colGap:mode.colGap
}},

teamData.map(
function(set){return(
preact.h("div",{style:{flex:"0 0 "+mode.width+"%"}},
preact.h("span",{style:{display:'flex'}},
preact.h(SetBlock,{set:set,gen:_this2.state.spriteGen,mode:_this2.state.displayMode})
)
));}

)
)
);
};_proto2.
checkTeamID=function checkTeamID(){
if(this.id.includes('-')){var _this$id$split=
this.id.split('-');this.id=_this$id$split[0];this.pw=_this$id$split[1];
}
if(!/^\d+$/.test(this.id)){
this.setState({error:"Invalid team ID: "+JSON.stringify(this.props.args)});
return;
}
this.loadTeamData();
};_proto2.

changeManage=function changeManage(){
this.setState({manageOpen:!this.state.manageOpen});
};_proto2.

changeSpriteGen=function changeSpriteGen(event){
localStorage.setItem('spritegen',""+event.target.value);
this.setState({spriteGen:event.target.value});
};_proto2.

changeDisplayMode=function changeDisplayMode(){
var keys=Object.keys(MODES);
var next=keys.indexOf(this.state.displayMode||'1col')+1;
if(!keys[next]){
next=0;
}
this.state.displayMode=keys[next];
localStorage.setItem('teamdisplaymode',this.state.displayMode);
this.setState({displayMode:this.state.displayMode});
};_proto2.

changeColorMode=function changeColorMode(){var _document$querySelect2;
var classList=(_document$querySelect2=document.querySelector('html'))==null?void 0:_document$querySelect2.classList;
var isDark=(classList==null?void 0:classList[0])==='dark';
if(isDark){
classList.remove('dark');
localStorage.removeItem('darkmode');
}else{
classList==null||classList.add('dark');
localStorage.setItem('darkmode','true');
}

this.forceUpdate();
};_proto2.

loadTeamData=function loadTeamData(){var _this3=this;
void query('getteam',{query:{teamid:this.id,password:this.pw,full:1}}).then(function(result){
if(result.actionerror){
_this3.setState({error:result.actionerror});
}else{
_this3.setState({team:result.team===null?result.team:result});
}
})["catch"](function(e){
_this3.setState({error:"HTTP"+e.code+": "+e.message});
});
};_proto2.

runDelete=function runDelete(){
var conf=toID(prompt("Do you really want to delete this team? Type 'yes' to confirm."));
if(conf!=='yes'){
return;
}
void query('deleteteam',{query:{teamid:this.id}}).then(function(result){
if(result.actionerror){
alert("Error deleting team: "+result.actionerror);
}else{
alert(
result.success?"Team successfully deleted.":"Error while deleting team. Please try again later."


);
if(result.success){
location.replace('../');
}
}
});
};_proto2.

copyTeam=function copyTeam(){var _this4=this;
if(!this.state.team)return;
var team=unpackTeam(this.state.team.team);
navigator.clipboard.writeText(team.map(exportSet).join('\n'));
this.setState({copyButtonMsg:true});
setTimeout(function(){
_this4.setState({copyButtonMsg:false});
},1000);
};_proto2.

copyToBuilder=function copyToBuilder(){var _this5=this;
void query('copyteam',{query:{teamid:this.id,pw:this.pw}}).then(function(result){
if(result.actionerror){
_this5.setState({copyError:result.actionerror,copied:null});
}else{
_this5.setState({copied:result.teamid,copyError:null});
}
});
};_proto2.

editTeamValue=function editTeamValue(val,_ref2){var _this$state;var currentTarget=_ref2.currentTarget;
((_this$state=this.state).teamEdits||(_this$state.teamEdits={}))[val]=currentTarget.value;
var changes;
if(val==='format'){var _this$state$team2;
var format=toID(currentTarget.value);
format=toID(BattleAliases[format])||format;
if(!/^gen\d+/.test(format)){
format="gen9"+format;
}
changes=changes||format!==((_this$state$team2=this.state.team)==null?void 0:_this$state$team2.format);
}else if(val==='private'){var _this$state$team3;
changes=changes||currentTarget.value!==((_this$state$team3=this.state.team)==null?void 0:_this$state$team3["private"]);
}
this.setState({
teamEdits:this.state.teamEdits,
changesMade:changes
});
};_proto2.

commitEdit=function commitEdit(){var _this6=this;
if(!this.state.changesMade||!this.state.team)return;
void query('editteam',{
query:Object.assign({teamid:this.id},this.state.teamEdits)
}).then(function(resultText){var _this6$state$team;
if(resultText.startsWith(']'))resultText=resultText.slice(1);
var result;
try{
result=JSON.parse(resultText);
}catch(_unused){
result={actionerror:"Malformed response received. Try again later."};
}
if(result.team["private"]!==((_this6$state$team=_this6.state.team)==null?void 0:_this6$state$team["private"])){
history.pushState({},'',new URL(
location.href.split(_this6.id)[0]+_this6.id+(
result.team["private"]?"-"+result.team["private"]:'')
));
}
if(result.actionerror){
_this6.setState({editError:result.actionerror,changesMade:false,teamEdits:null});
}else{
_this6.setState({team:result.team,changesMade:false,teamEdits:null});
}
});
};return TeamViewer;}(preact.Component);
//# sourceMappingURL=teams-view.js.map