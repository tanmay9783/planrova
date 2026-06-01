import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';

const XPFlyAnimation = forwardRef((props, ref) => {
  const [animations, setAnimations] = useState([]);

  useImperativeHandle(ref, () => ({
    trigger(amount = 10, x = 100, y = 100) {
      const id = Date.now().toString() + Math.random().toString();
      const animVal = new Animated.Value(0);
      
      const newAnim = {
        id,
        amount,
        x,
        y,
        animVal,
      };

      setAnimations((prev) => [...prev, newAnim]);

      Animated.timing(animVal, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }).start(() => {
        // Cleanup
        setAnimations((prev) => prev.filter((item) => item.id !== id));
      });
    }
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {animations.map((anim) => {
        const translateY = anim.animVal.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -80],
        });
        
        const opacity = anim.animVal.interpolate({
          inputRange: [0, 0.8, 1],
          outputRange: [1, 0.9, 0],
        });

        const scale = anim.animVal.interpolate({
          inputRange: [0, 0.2, 1],
          outputRange: [0.6, 1.2, 0.9],
        });

        return (
          <Animated.View
            key={anim.id}
            style={[
              styles.floatingTextContainer,
              {
                left: anim.x,
                top: anim.y,
                opacity: opacity,
                transform: [
                  { translateY: translateY },
                  { scale: scale },
                ],
              },
            ]}
          >
            <Text style={styles.floatingText}>+{anim.amount} XP</Text>
          </Animated.View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  floatingTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#BA7517',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: '#BA7517',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
    zIndex: 9999,
  },
  floatingText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#0F1115',
  },
});

export default XPFlyAnimation;
