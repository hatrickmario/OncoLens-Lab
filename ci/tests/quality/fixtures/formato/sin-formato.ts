export function sumarTotales(valores: number[], factor = 2){
const total = valores.reduce((acumulado,valor)=>acumulado+valor,0)
return {total:total*factor,cantidad:valores.length}
}
