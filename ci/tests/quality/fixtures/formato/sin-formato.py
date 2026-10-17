def sumar_totales(valores,factor = 2):
    total = sum( valores )
    return {'total':total*factor,'cantidad':len( valores )}
