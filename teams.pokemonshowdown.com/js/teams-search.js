"use strict";function _inheritsLoose(subClass,superClass){subClass.prototype=Object.create(superClass.prototype);subClass.prototype.constructor=subClass;_setPrototypeOf(subClass,superClass);}function _setPrototypeOf(o,p){_setPrototypeOf=Object.setPrototypeOf?Object.setPrototypeOf.bind():function _setPrototypeOf(o,p){o.__proto__=p;return o;};return _setPrototypeOf(o,p);}









var SEARCH_KEYS=['format','owner','gen'];var

TeamSearcher=function(_preact$Component){_inheritsLoose(TeamSearcher,_preact$Component);







function TeamSearcher(props){var _this;
_this=_preact$Component.call(this,props)||this;_this.state={result:[],curCount:20,search:{},loading:false,searchUnchanged:null};

var url=new URL(location.href);
var makeSearch=false;for(var _i2=0;_i2<
SEARCH_KEYS.length;_i2++){var key=SEARCH_KEYS[_i2];
var _val=url.searchParams.get(key);
if(toID(_val)){
_this.state.search[key]=toID(_val);
makeSearch=true;
}
if(_this.props.args.type===key){
var propVal=toID(_this.props.args.val);
if(propVal){
_this.state.search[key]=propVal;
makeSearch=true;
}
}
}
var count=Number(url.searchParams.get('count'));
if(!isNaN(count)&&count>0){
_this.state.curCount=count;
}
if(makeSearch){
_this.search(0,true);
}return _this;
}var _proto=TeamSearcher.prototype;_proto.

onInput=function onInput(key,_ref){var currentTarget=_ref.currentTarget;
this.state.search[key]=toID(currentTarget.value);
this.setState({search:this.state.search});
};_proto.

search=function search(){var _BattleAliases,_this2=this;var incrementCount=arguments.length>0&&arguments[0]!==undefined?arguments[0]:0;var noSetUrl=arguments.length>1&&arguments[1]!==undefined?arguments[1]:false;
this.state.curCount+=incrementCount;
this.setState({
loading:true,
stateUnchanged:true,
curCount:this.state.curCount
});

var url=new URL(location.href);

for(var _val2 in url.searchParams)url.searchParams["delete"](_val2);

for(var k in this.state.search){
url.searchParams.set(k,this.state.search[k]);
}
url.searchParams.set('count',""+this.state.curCount);
if(!noSetUrl)history.pushState({},'',url);

var format=this.state.search.format?
toID((_BattleAliases=BattleAliases)==null?void 0:_BattleAliases[this.state.search.format])||this.state.search.format:
undefined;

if(format){
if(!format.startsWith('gen')){
format="gen"+(this.state.search.gen||9)+format;
delete this.state.search.gen;
}
}else{
format=undefined;
}
for(var _k in this.state.search){
if(!this.state.search[_k])delete this.state.search[_k];
}
void query('searchteams',{
query:Object.assign({},this.state.search,{format:format,count:this.state.curCount})
}).then(function(result){
_this2.setState(Object.assign({},result,{loading:false}));
});
};_proto.

render=function render(){var _this3=this;
if(this.state.loading){
return preact.h("div",{"class":"section",style:{wordWrap:'break-word'}},"Loading...");
}
return preact.h("div",{"class":"section",style:{wordWrap:'break-word',textAlign:'center'}},
preact.h("small",null,preact.h("a",{href:'//'+Config.routes.teams},preact.h("i",{style:{"float":'left'},"class":"fa fa-arrow-left"}))),
preact.h("h1",null,"Search Teams"),
preact.h("br",null),
preact.h("div",{name:"searchsection"},
preact.h("label",null,"Format: "),
preact.h("input",{value:this.state.search.format,onInput:function(e){return _this3.onInput('format',e);}}),preact.h("br",null),
preact.h("label",null,"Owner: "),
preact.h("input",{value:this.state.search.owner,onInput:function(e){return _this3.onInput('owner',e);}}),preact.h("br",null),
preact.h("label",null,"Generation: "),
preact.h("input",{value:this.state.search.gen,onInput:function(e){return _this3.onInput('gen',e);}}),preact.h("br",null),
preact.h("button",{"class":"button notifying",onClick:function(){return _this3.search();}},"Search!")
),
preact.h("hr",null),
!this.state.result.length?preact.h(preact.Fragment,null):
preact.h("ul",{"class":"teamlist"},
this.state.result.map(function(team){return preact.h("li",null,preact.h(MiniTeam,{team:team,fullTeam:true}));})
),
this.state.result.actionerror?
preact.h("div",{"class":"message-error"},this.state.result.actionerror):
preact.h(preact.Fragment,null),

this.state.result.length===this.state.curCount?
preact.h("button",{"class":"button notifying",onClick:function(){return _this3.search(20);}},"More"):
preact.h(preact.Fragment,null)

);
};return TeamSearcher;}(preact.Component);
//# sourceMappingURL=teams-search.js.map