package com.example.ptdapp.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.example.ptdapp.R

//Tipografia OpenSans normal
val OpenSansNormal = FontFamily(
    Font(R.font.opensans_regular, FontWeight.Normal),
    Font(R.font.opensans_bold, FontWeight.Bold)
)

//Tipografia OpenSans semicondensed
val OpenSansSemiCondensed = FontFamily(
    Font(R.font.opensans_semicondensed_bold, FontWeight.Bold),
    Font(R.font.opensans_semicondensed_regular, FontWeight.Normal)
)
//Tipografia OpenSans condensed
val OpenSansCondensed = FontFamily(
//    Font(R.font.opensans_condensed_bold, FontWeight.Bold),
    Font(R.font.opensans_condensed_regular, FontWeight.Normal)
)

//Tipografia Dongle
val Dongle = FontFamily(
//    Font(R.font.dongle_light, FontWeight.Light),
    Font(R.font.dongle_regular, FontWeight.Normal),
//    Font(R.font.dongle_bold, FontWeight.Bold)
)
//Tipografia OpenSauce condensed
val OpenSauce = FontFamily(
    Font(R.font.opensauce_regular, FontWeight.Normal)
)


// Set of Material typography styles to start with
val Typography = Typography(
    bodyLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.5.sp
    )



    /* Other default text styles to override
    titleLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 22.sp,
        lineHeight = 28.sp,
        letterSpacing = 0.sp
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.5.sp
    )
    */
)
val Typography2 = Typography(
    bodyLarge = TextStyle(
        fontFamily = OpenSansNormal,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp
    )
)